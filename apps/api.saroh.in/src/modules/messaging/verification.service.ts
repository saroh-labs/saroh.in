import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import {
    BadRequestException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    Optional,
} from "@nestjs/common";
import type {
    MessagingChannel,
    MessagingSendStatus,
    PhoneVerificationStatus,
    VerificationModule,
} from "@saroh/database";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";

import { normalisePhoneNumber } from "@saroh/block-contract";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { siteCodeSecret } from "../site-accounts/site-secrets";
import { enqueueBusinessSitesRevalidation } from "../sites/page-cache-revalidate";
import { checkAbuse } from "./abuse-guard";
import { VERIFICATION_MODULES } from "./dto";

/**
 * Saroh-sent verification codes (DEC-191, #1238): the session primitive.
 * No transport or wallet here; the orchestrator does those and calls this.
 * `start` refuses with a 429 past the abuse limits (`abuse-guard.ts`). The plaintext code goes back to that in-process caller only:
 * the row keeps an HMAC of it under the site sign-in code secret, as
 * customer sign-in codes do. A code lives 10 minutes and allows 5 tries.
 */
export const VERIFICATION_TTL_MS = 10 * 60_000;
export const VERIFICATION_MAX_ATTEMPTS = 5;

export type CheckOutcome =
    | "verified"
    | "wrong_code"
    | "expired"
    | "too_many_attempts"
    | "already_verified"
    | "not_found";

const REFUSED: Record<PhoneVerificationStatus, CheckOutcome> = {
    PENDING: "wrong_code",
    VERIFIED: "already_verified",
    EXPIRED: "expired",
    FAILED: "too_many_attempts",
};

function codeHash(
    organizationId: string,
    phoneE164: string,
    code: string,
): string {
    return createHmac("sha256", siteCodeSecret())
        .update(
            ["phone-verification", organizationId, phoneE164, code].join("\n"),
        )
        .digest("hex");
}

function sameHash(a: string, b: string): boolean {
    const x = Buffer.from(a, "hex");
    const y = Buffer.from(b, "hex");
    return x.length === y.length && timingSafeEqual(x, y);
}

/** An Indian number as E.164, or a 400 (DEC-190: India only). */
export function indianPhoneE164(raw: string): string {
    const result = normalisePhoneNumber(raw);
    if ("phone" in result && result.phone?.startsWith("+91")) {
        return result.phone;
    }
    throw new BadRequestException({
        message: "Enter an Indian mobile number, like +91 98450 12345.",
        details: { field: "phone" },
    });
}

@Injectable()
export class VerificationService {
    /**
     * Saroh sends NO phone codes on a business's behalf for now (owner,
     * 27 Oct, DEC-197): WhatsApp's one-business-per-account rule forbids one
     * Saroh number sending for many businesses. The approval flag, the
     * balance and every send path stay built, hidden behind this.
     * shortcut: a code switch, not a setting; flip it (and DEC-197) when
     * businesses send from their own WhatsApp or Saroh's SMS (DLT) is in.
     * Specs that exercise the hidden paths set it to true.
     */
    static sendsForBusinesses = false;

    constructor(
        @Optional()
        private readonly flags: FeatureFlagService = new FeatureFlagService(),
    ) {}

    /**
     * Whether Saroh may send this business's customers phone codes at all:
     * the owner approves each business (`CUSTOMER_PHONE_CODES`) until the
     * full rollout (DEC-196). Every module's switch and send asks it.
     */
    async approved(organizationId: string): Promise<boolean> {
        if (!VerificationService.sendsForBusinesses) return false;
        return this.flags.isEnabled(
            FlagKey.CUSTOMER_PHONE_CODES,
            organizationId,
        );
    }

    async start(input: {
        organizationId: string;
        module: VerificationModule;
        phoneE164: string;
        subjectRef?: string;
        ipHash?: string;
    }): Promise<{ verificationId: string; code: string; expiresAt: Date }> {
        const { organizationId } = input;
        const phoneE164 = indianPhoneE164(input.phoneE164);
        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
        // Counted with no GUC so the per-number windows see every business;
        // the GUC is set for the insert alone. Locks + count + insert are one tx.
        const row = await outsideOrgContext(() =>
            prisma.$transaction(async (tx) => {
                const verdict = await checkAbuse(tx, {
                    organizationId,
                    phoneE164,
                    ipHash: input.ipHash,
                });
                if (!verdict.allowed) {
                    throw new HttpException(
                        {
                            message:
                                "Too many codes sent. Try again in a little while.",
                            details: {
                                reason: verdict.reason,
                                retryAfterSeconds: verdict.retryAfterSeconds,
                            },
                        },
                        HttpStatus.TOO_MANY_REQUESTS,
                    );
                }
                await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
                return tx.phoneVerification.create({
                    data: {
                        organizationId,
                        module: input.module,
                        phoneE164,
                        subjectRef: input.subjectRef,
                        ipHash: input.ipHash,
                        codeHash: codeHash(organizationId, phoneE164, code),
                        expiresAt,
                    },
                    select: { id: true },
                });
            }),
        );
        return { verificationId: row.id, code, expiresAt };
    }

    /** One row per message handed to a provider; a fallback is a second. */
    async recordSend(input: {
        organizationId: string;
        verificationId: string;
        channel: MessagingChannel;
        pricePaise: number;
        providerMessageId?: string;
        status: MessagingSendStatus;
        failureReason?: string;
    }): Promise<{ sendId: string }> {
        const { organizationId, verificationId } = input;
        return runInOrgContext(organizationId, async () => {
            // The FK alone would accept another business's session.
            await prisma.phoneVerification.findFirstOrThrow({
                where: { id: verificationId, organizationId },
                select: { id: true },
            });
            const send = await prisma.messagingSend.create({
                data: {
                    organizationId,
                    verificationId,
                    channel: input.channel,
                    pricePaise: input.pricePaise,
                    providerMessageId: input.providerMessageId,
                    status: input.status,
                    failureReason: input.failureReason,
                },
                select: { id: true },
            });
            return { sendId: send.id };
        });
    }

    /**
     * Spend one try on `code`. Each step is a conditional update on the
     * session's status and attempts, so parallel checks can neither both
     * verify nor spend more than five tries between them.
     */
    async check(input: {
        organizationId: string;
        verificationId: string;
        code: string;
    }): Promise<CheckOutcome> {
        const { organizationId, verificationId: id } = input;
        return runInOrgContext(organizationId, async () => {
            const live = await prisma.phoneVerification.findFirst({
                where: { id, organizationId },
                select: {
                    status: true,
                    codeHash: true,
                    phoneE164: true,
                    expiresAt: true,
                },
            });
            if (!live) return "not_found";
            if (live.status !== "PENDING") return REFUSED[live.status];

            const now = new Date();
            const pending = { id, organizationId, status: "PENDING" } as const;
            if (live.expiresAt <= now) {
                await prisma.phoneVerification.updateMany({
                    where: pending,
                    data: { status: "EXPIRED" },
                });
                return "expired";
            }

            const counted = await prisma.phoneVerification.updateMany({
                where: {
                    ...pending,
                    attempts: { lt: VERIFICATION_MAX_ATTEMPTS },
                    expiresAt: { gt: now },
                },
                data: { attempts: { increment: 1 } },
            });
            if (counted.count === 0) return this.closeSpent(id, organizationId);

            const given = codeHash(organizationId, live.phoneE164, input.code);
            if (sameHash(given, live.codeHash)) {
                const used = await prisma.phoneVerification.updateMany({
                    where: pending,
                    data: { status: "VERIFIED", verifiedAt: now },
                });
                return used.count === 1
                    ? "verified"
                    : this.closeSpent(id, organizationId);
            }
            const failed = await prisma.phoneVerification.updateMany({
                where: {
                    ...pending,
                    attempts: { gte: VERIFICATION_MAX_ATTEMPTS },
                },
                data: { status: "FAILED" },
            });
            return failed.count === 1 ? "too_many_attempts" : "wrong_code";
        });
    }

    /** Whether the business has Saroh send codes for `module`; off until turned on. */
    async isEnabled(
        organizationId: string,
        module: VerificationModule,
    ): Promise<boolean> {
        const row = await runInOrgContext(organizationId, () =>
            prisma.messagingVerificationSetting.findUnique({
                where: { organizationId_module: { organizationId, module } },
                select: { enabled: true },
            }),
        );
        return row?.enabled === true;
    }

    /** Every module's switch; one never set is off. */
    async settings(
        organizationId: string,
    ): Promise<{ module: VerificationModule; enabled: boolean }[]> {
        const rows = await runInOrgContext(organizationId, () =>
            prisma.messagingVerificationSetting.findMany({
                where: { organizationId },
                select: { module: true, enabled: true },
            }),
        );
        return VERIFICATION_MODULES.map((module) => ({
            module,
            enabled: rows.some((r) => r.module === module && r.enabled),
        }));
    }

    async setEnabled(
        organizationId: string,
        module: VerificationModule,
        enabled: boolean,
    ): Promise<{ module: VerificationModule; enabled: boolean }[]> {
        if (enabled && !(await this.approved(organizationId))) {
            throw new ForbiddenException({
                message:
                    "WhatsApp codes for your customers aren't open to your business yet. Ask Saroh to turn them on.",
                details: { code: "PHONE_CODES_NOT_APPROVED" },
            });
        }
        await runInOrgContext(organizationId, () =>
            prisma.$transaction(async (tx) => {
                await tx.messagingVerificationSetting.upsert({
                    where: {
                        organizationId_module: { organizationId, module },
                    },
                    create: { organizationId, module, enabled },
                    update: { enabled },
                });
                // ACCOUNT codes decide whether the site's sign-in sheet,
                // drawn into every page, offers WhatsApp (DEC-196).
                if (module === "ACCOUNT") {
                    await enqueueBusinessSitesRevalidation(
                        tx,
                        organizationId,
                        "sign-in",
                    );
                }
            }),
        );
        return this.settings(organizationId);
    }

    /** Sessions started and verified over the last 30 days; rate null with none. */
    async successRate(
        organizationId: string,
        now = new Date(),
    ): Promise<{ started: number; verified: number; rate: number | null }> {
        const since = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
        const [started, verified] = await runInOrgContext(organizationId, () =>
            Promise.all([
                prisma.phoneVerification.count({
                    where: { organizationId, createdAt: { gte: since } },
                }),
                prisma.phoneVerification.count({
                    where: {
                        organizationId,
                        createdAt: { gte: since },
                        status: "VERIFIED",
                    },
                }),
            ]),
        );
        return { started, verified, rate: started ? verified / started : null };
    }

    /** Close a session that no code reached (nothing sent, or the send refused). */
    async fail(organizationId: string, verificationId: string): Promise<void> {
        await runInOrgContext(organizationId, () =>
            prisma.phoneVerification.updateMany({
                where: {
                    id: verificationId,
                    organizationId,
                    status: "PENDING",
                },
                data: { status: "FAILED" },
            }),
        );
    }

    /** The provider's answer on a send recorded before the call. */
    async updateSend(
        organizationId: string,
        sendId: string,
        data: {
            status: MessagingSendStatus;
            providerMessageId?: string;
            failureReason?: string;
        },
    ): Promise<void> {
        await runInOrgContext(organizationId, () =>
            prisma.messagingSend.updateMany({
                where: { id: sendId, organizationId },
                data,
            }),
        );
    }

    /** A try that lost a race: fail a session out of tries, say why it closed. */
    private async closeSpent(
        id: string,
        organizationId: string,
    ): Promise<CheckOutcome> {
        await prisma.phoneVerification.updateMany({
            where: {
                id,
                organizationId,
                status: "PENDING",
                attempts: { gte: VERIFICATION_MAX_ATTEMPTS },
            },
            data: { status: "FAILED" },
        });
        const row = await prisma.phoneVerification.findFirstOrThrow({
            where: { id, organizationId },
            select: { status: true, expiresAt: true },
        });
        if (row.status === "PENDING" && row.expiresAt <= new Date()) {
            return "expired";
        }
        return REFUSED[row.status];
    }
}
