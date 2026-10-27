import {
    BadRequestException,
    HttpException,
    HttpStatus,
    Injectable,
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
import { assertOrganizationWindingDown } from "../organizations/organization-lifecycle.gate";
import { LIVE_ACCOUNT_STATUSES } from "./customer-account.repository";
import type { RequestPhoneCodeDto, VerifyPhoneCodeDto } from "./dto";
import { phoneProofFor } from "./phone-proof";
import type { CodeRequested, SessionIssued } from "./sign-in-codes.service";
import {
    limited,
    SignInCodesService,
    UNAVAILABLE_MESSAGE,
} from "./sign-in-codes.service";
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
 * A site account is keyed by its verified email, so a phone is added to an
 * email account, never instead of one: a correct code for a phone an
 * account holds opens that account's session; for a phone none holds it
 * answers `emailNeeded` with a proof, and the email code that follows adds
 * the phone to that email's account (`SignInCodesService.verifyCode`). The
 * request answers the same for every number; only someone who has just
 * proved the phone learns whether it had an account.
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
    ) {}

    /** Whether sign-in offers a WhatsApp code on this site now. */
    async offered(relay: SiteRelay): Promise<boolean> {
        const site = await resolveSiteHost(relay.host).catch(() => null);
        return site ? this.send.canSend(site.organizationId, "ACCOUNT") : false;
    }

    /** Off unless the owner approved this business (DEC-196): 503 unavailable. */
    private async assertApproved(organizationId: string): Promise<void> {
        if (!(await this.verification.approved(organizationId))) {
            throw new ServiceUnavailableException({
                message: UNAVAILABLE_MESSAGE,
                details: { reason: "unavailable" },
            });
        }
    }

    async requestCode(
        relay: SiteRelay,
        dto: RequestPhoneCodeDto,
    ): Promise<CodeRequested> {
        const site = await resolveSiteHost(relay.host);
        await runInOrgContext(site.organizationId, () =>
            assertOrganizationWindingDown(site.organizationId),
        );
        await this.assertApproved(site.organizationId);
        const phoneE164 = indianPhoneE164(dto.phone);
        const now = new Date();
        this.codes.takeAddress(site, relay, now);
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

    async verifyCode(
        relay: SiteRelay,
        dto: VerifyPhoneCodeDto,
    ): Promise<SessionIssued | PhoneNeedsEmail> {
        const site = await resolveSiteHost(relay.host);
        const organizationId = site.organizationId;
        await runInOrgContext(organizationId, () =>
            assertOrganizationWindingDown(organizationId),
        );
        await this.assertApproved(organizationId);
        const phoneE164 = indianPhoneE164(dto.phone);
        const now = new Date();
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

        return runInOrgContext(organizationId, async () => {
            const account = await prisma.customerAccount.findFirst({
                where: {
                    organizationId,
                    phoneE164,
                    status: { in: [...LIVE_ACCOUNT_STATUSES] },
                },
                select: { email: true },
            });
            if (!account) {
                return {
                    emailNeeded: true as const,
                    phoneProof: phoneProofFor(organizationId, phoneE164, now),
                };
            }
            // Through the email's own path, so a merged or blocked account
            // answers as it would to its email code.
            return this.codes.openSession(site, account.email, now);
        });
    }
}
