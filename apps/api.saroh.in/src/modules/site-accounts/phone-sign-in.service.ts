import {
    BadRequestException,
    HttpException,
    HttpStatus,
    Injectable,
    NotFoundException,
    ServiceUnavailableException,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { RESEND_COOLDOWN_SECONDS } from "../messaging/abuse-guard";
import { VerificationSendService } from "../messaging/verification-send.service";
import {
    indianPhoneE164,
    VERIFICATION_TTL_MS,
    VerificationService,
} from "../messaging/verification.service";
import {
    assertOrganizationOpen,
    assertOrganizationWindingDown,
} from "../organizations/organization-lifecycle.gate";
import { AccountLinkingService } from "./account-linking.service";
import { LIVE_ACCOUNT_STATUSES } from "./customer-account.repository";
import type { CustomerContext } from "./customer-context.decorator";
import type { RequestPhoneCodeDto, VerifyPhoneCodeDto } from "./dto";
import { phoneProofFor } from "./phone-proof";
import type { CodeRequested, SessionIssued } from "./sign-in-codes.service";
import {
    limited,
    SignInCodesService,
    UNAVAILABLE_MESSAGE,
} from "./sign-in-codes.service";
import { SignInWaysService } from "./sign-in-ways";
import type { SiteHost } from "./site-host";
import { resolveSiteHost } from "./site-host";
import type { SiteRelay } from "./site-relay";

/**
 * A customer signing in on a business's site with a WhatsApp code from
 * Saroh's sender (DEC-196, DEC-191), beside the email code.
 *
 * Offered only while the business has the ACCOUNT module on and its balance
 * covers a code, so nobody types a number into a way that then fails. Every
 * code spends the business's money, so every request passes the challenge
 * (when Turnstile is configured), the per-address limit and the messaging
 * abuse limits (per number, business and address); the code is held, sent
 * and checked by `modules/messaging`.
 *
 * Offered, asked for and checked only while WhatsApp is one of the site's
 * ways now (`sign-in-ways.ts`): chosen by the business and working.
 *
 * A correct code for a phone an account holds opens that account's
 * session. For a phone none holds: a business that chose its ways makes a
 * phone-only account (DEC-196, a phone alone is enough); one that never
 * chose keeps unit 3's flow, answering `emailNeeded` with a proof, and the
 * email code that follows adds the phone to that email's account
 * (`SignInCodesService.verifyCode`). The request answers the same for
 * every number; only someone who has just proved the phone learns whether
 * it had an account.
 *
 * A signed-in customer adds a phone to their account the same way
 * (`requestAddCode`, `confirmAdd`).
 */
export interface PhoneNeedsEmail {
    emailNeeded: true;
    phoneProof: string;
}

function wrongCode(reason: "invalid" | "expired"): BadRequestException {
    return new BadRequestException({
        message:
            reason === "expired"
                ? "That code has expired. Ask for a new one."
                : "That code isn't right. Check WhatsApp and try again.",
        details: { reason },
    });
}

const CUSTOMER_CANNOT_FIX: number[] = [
    HttpStatus.FORBIDDEN,
    HttpStatus.PAYMENT_REQUIRED,
    HttpStatus.SERVICE_UNAVAILABLE,
];

/** The messaging refusals, as site sign-in answers them. */
function siteRefusal(error: unknown): unknown {
    if (!(error instanceof HttpException)) return error;
    const status = error.getStatus();
    const details = (
        error.getResponse() as { details?: Record<string, unknown> }
    ).details;
    if (status === Number(HttpStatus.TOO_MANY_REQUESTS)) {
        const after = Number(details?.retryAfterSeconds) || 60;
        // The business's own ceiling is shared; a number or address is theirs.
        return limited(
            details?.reason === "business" ? "wait" : "limit",
            after,
        );
    }
    // Off, out of balance, unpriced or not sent: the customer can't fix it.
    if (CUSTOMER_CANNOT_FIX.includes(status)) {
        return new ServiceUnavailableException({
            message: UNAVAILABLE_MESSAGE,
            details: { reason: "unavailable" },
        });
    }
    return error;
}

@Injectable()
export class PhoneSignInService {
    constructor(
        private readonly codes: SignInCodesService,
        private readonly send: VerificationSendService,
        private readonly verification: VerificationService,
        private readonly ways: SignInWaysService,
        private readonly linking: AccountLinkingService,
    ) {}

    /** Send a code to the phone (the caller checked the way and the site). */
    private async sendTo(
        site: SiteHost,
        relay: SiteRelay,
        dto: RequestPhoneCodeDto,
    ): Promise<CodeRequested> {
        const phoneE164 = indianPhoneE164(dto.phone);
        this.codes.takeAddress(site, relay, new Date());
        await this.codes.passChallenge(site, relay, dto.challenge);
        try {
            await this.send.sendCode({
                organizationId: site.organizationId,
                module: "ACCOUNT",
                phoneE164,
                ipHash: relay.clientHash,
            });
        } catch (error) {
            throw siteRefusal(error);
        }
        return {
            sent: true,
            expiresInSeconds: VERIFICATION_TTL_MS / 1000,
            resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
        };
    }

    /** Check the newest code this business sent the phone; 400 when wrong. */
    private async check(
        site: SiteHost,
        relay: SiteRelay,
        dto: VerifyPhoneCodeDto,
        now: Date,
    ): Promise<string> {
        const { organizationId } = site;
        const phoneE164 = indianPhoneE164(dto.phone);
        this.codes.takeVerifyTry(site, relay, `phone:${phoneE164}`, now);
        // The newest code this business sent the number for sign-in; an
        // older one still waiting is never the one to type.
        const live = await runInOrgContext(organizationId, () =>
            prisma.phoneVerification.findFirst({
                where: { organizationId, module: "ACCOUNT", phoneE164 },
                orderBy: { createdAt: "desc" },
                select: { id: true },
            }),
        );
        if (!live) throw wrongCode("expired");
        const outcome = await this.verification.check({
            organizationId,
            verificationId: live.id,
            code: dto.code,
        });
        if (outcome === "wrong_code") throw wrongCode("invalid");
        if (outcome !== "verified") throw wrongCode("expired");
        return phoneE164;
    }

    async requestCode(
        relay: SiteRelay,
        dto: RequestPhoneCodeDto,
    ): Promise<CodeRequested> {
        const site = await resolveSiteHost(relay.host);
        await runInOrgContext(site.organizationId, () =>
            assertOrganizationWindingDown(site.organizationId),
        );
        await this.ways.assertOffered(site.organizationId, "WHATSAPP");
        return this.sendTo(site, relay, dto);
    }

    async verifyCode(
        relay: SiteRelay,
        dto: VerifyPhoneCodeDto,
    ): Promise<SessionIssued | PhoneNeedsEmail> {
        const site = await resolveSiteHost(relay.host);
        const organizationId = site.organizationId;
        await runInOrgContext(organizationId, () =>
            assertOrganizationWindingDown(organizationId),
        );
        const ways = await this.ways.view(organizationId);
        await this.ways.assertOffered(organizationId, "WHATSAPP");
        const now = new Date();
        const phoneE164 = await this.check(site, relay, dto, now);

        if (!ways.phoneOnlySignUp) {
            const held = await runInOrgContext(organizationId, () =>
                prisma.customerAccount.count({
                    where: {
                        organizationId,
                        phoneE164,
                        status: { in: [...LIVE_ACCOUNT_STATUSES] },
                    },
                }),
            );
            if (held === 0) {
                return {
                    emailNeeded: true as const,
                    phoneProof: phoneProofFor(organizationId, phoneE164, now),
                };
            }
        }
        return runInOrgContext(organizationId, () =>
            this.codes.openPhoneSession(site, phoneE164, now),
        );
    }

    /** A signed-in customer asks for a code to add a phone (DEC-196). */
    async requestAddCode(
        customer: CustomerContext,
        relay: SiteRelay,
        dto: RequestPhoneCodeDto,
    ): Promise<CodeRequested> {
        const site = await siteOf(customer, relay);
        await runInOrgContext(site.organizationId, () =>
            assertOrganizationOpen(site.organizationId),
        );
        await this.ways.assertOffered(site.organizationId, "WHATSAPP");
        return this.sendTo(site, relay, dto);
    }

    /**
     * Add the phone with its code. The same answer every time: a phone
     * another live account holds stays where it is (staff's call, as for a
     * recycled number), and the answer never says it is taken. Replaces
     * the account's phone when it had one.
     */
    async confirmAdd(
        customer: CustomerContext,
        relay: SiteRelay,
        dto: VerifyPhoneCodeDto,
    ): Promise<{ done: true }> {
        const site = await siteOf(customer, relay);
        const { organizationId } = site;
        await runInOrgContext(organizationId, () =>
            assertOrganizationOpen(organizationId),
        );
        await this.ways.assertOffered(organizationId, "WHATSAPP");
        const now = new Date();
        const phoneE164 = await this.check(site, relay, dto, now);
        await runInOrgContext(organizationId, () =>
            prisma.$transaction((tx) =>
                this.linking.addPhone(
                    tx,
                    organizationId,
                    customer.accountId,
                    phoneE164,
                    now,
                ),
            ),
        );
        return { done: true };
    }
}

/** The site the session is on (the guard already matched the two). */
async function siteOf(
    customer: CustomerContext,
    relay: SiteRelay,
): Promise<SiteHost> {
    const site = await resolveSiteHost(relay.host);
    if (
        site.organizationId !== customer.organizationId ||
        site.siteId !== customer.siteId
    ) {
        throw new NotFoundException();
    }
    return site;
}
