import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { BadRequestException, Injectable } from "@nestjs/common";
import type {
    MessagingChannel,
    MessagingSendStatus,
    PhoneVerificationStatus,
    VerificationModule,
} from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { normalisePhoneNumber } from "@saroh/block-contract";

import { siteCodeSecret } from "../site-accounts/site-secrets";

/**
 * Saroh-sent verification codes (DEC-191, #1238): the session primitive.
 * No transport, wallet or rate limit here; the orchestrator does those and
 * calls this. The plaintext code goes back to that in-process caller only:
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
        const row = await runInOrgContext(organizationId, () =>
            prisma.phoneVerification.create({
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
