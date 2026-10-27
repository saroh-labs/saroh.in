import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    ServiceUnavailableException,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { VerificationSendService } from "../messaging/verification-send.service";
import { VerificationService } from "../messaging/verification.service";
import { enqueueBusinessSitesRevalidation } from "../sites/page-cache-revalidate";
import type { SignInWay, WayBlocked } from "./sign-in-way-rules";
import {
    effectiveWays,
    SIGN_IN_WAYS,
    UNAVAILABLE_MESSAGE,
    UNCHOSEN_WAYS,
} from "./sign-in-way-rules";

export {
    effectiveWays,
    SIGN_IN_WAYS,
    UNAVAILABLE_MESSAGE,
    UNCHOSEN_WAYS,
} from "./sign-in-way-rules";
export type { SignInWay, WayBlocked } from "./sign-in-way-rules";

/**
 * The ways a business's customers sign in and sign up on its site, in the
 * business's order (DEC-196, "The flows"). Stored on
 * `BusinessProfile.customerSignInWays`.
 *
 * - **Chosen**: what the business saved. Empty means it never chose:
 *   email, then WhatsApp where it works, which is how every business
 *   worked before the choice (unit 3), so nothing changes for them.
 * - **Effective**: the chosen ways that work right now, in order; email
 *   when none is left, so customers are never locked out. Email always
 *   works; WhatsApp works while Saroh approved the business, its ACCOUNT
 *   codes are on and its balance covers a code (`canSend`); SMS not yet
 *   (Saroh has no DLT registration, DEC-191).
 *
 * This file is the one place that is worked out. The sign-in options, the
 * WhatsApp code request and check, and the email code request and check
 * all ask it, so a way that is off is refused on the server too.
 */
export interface SignInWaysView {
    /** The business's order, or {@link UNCHOSEN_WAYS} until it chooses. */
    chosen: SignInWay[];
    /** False until the business saves its own list. */
    chosenByBusiness: boolean;
    /** What the site offers now, in order; the first is the default. */
    effective: SignInWay[];
    /** Every way, with whether it works now and why not. */
    ways: { way: SignInWay; usable: boolean; blocked: WayBlocked | null }[];
    /**
     * A new customer may sign up with a phone alone. Off only for a
     * business that never chose, whose WhatsApp sign-up still asks for an
     * email (unit 3's flow), so nothing changes for it.
     */
    phoneOnlySignUp: boolean;
}

function refused(message: string, code: string): BadRequestException {
    return new BadRequestException({
        message,
        details: { code, field: "ways" },
    });
}

@Injectable()
export class SignInWaysService {
    constructor(
        private readonly send: VerificationSendService,
        private readonly verification: VerificationService,
    ) {}

    /** What the business saved, or the unchosen default. */
    private async chosen(
        organizationId: string,
    ): Promise<{ ways: SignInWay[]; byBusiness: boolean }> {
        const profile = await runInOrgContext(organizationId, () =>
            prisma.businessProfile.findUnique({
                where: { organizationId },
                select: { customerSignInWays: true },
            }),
        );
        // A value this build doesn't know is skipped, never offered.
        const saved = (profile?.customerSignInWays ?? []).filter(
            (w): w is SignInWay =>
                (SIGN_IN_WAYS as readonly string[]).includes(w),
        );
        return saved.length > 0
            ? { ways: saved, byBusiness: true }
            : { ways: [...UNCHOSEN_WAYS], byBusiness: false };
    }

    /** Why WhatsApp can't be used now, or null when it can. */
    private async whatsappBlocked(
        organizationId: string,
    ): Promise<WayBlocked | null> {
        if (await this.send.canSend(organizationId, "ACCOUNT")) return null;
        if (!(await this.verification.approved(organizationId))) {
            return "NOT_APPROVED";
        }
        if (!(await this.verification.isEnabled(organizationId, "ACCOUNT"))) {
            return "SWITCHED_OFF";
        }
        return "NO_BALANCE";
    }

    async view(organizationId: string): Promise<SignInWaysView> {
        const [chosen, whatsapp] = await Promise.all([
            this.chosen(organizationId),
            this.whatsappBlocked(organizationId),
        ]);
        const blocked: Record<SignInWay, WayBlocked | null> = {
            EMAIL: null,
            WHATSAPP: whatsapp,
            SMS: "NOT_YET",
        };
        const usable = new Set(SIGN_IN_WAYS.filter((w) => !blocked[w]));
        return {
            chosen: chosen.ways,
            chosenByBusiness: chosen.byBusiness,
            effective: effectiveWays(chosen.ways, usable),
            ways: SIGN_IN_WAYS.map((way) => ({
                way,
                usable: usable.has(way),
                blocked: blocked[way],
            })),
            phoneOnlySignUp: chosen.byBusiness,
        };
    }

    /** What the site offers now, in order. */
    async effective(organizationId: string): Promise<SignInWay[]> {
        return (await this.view(organizationId)).effective;
    }

    /**
     * Refuse a way the site doesn't offer now (503 `unavailable`, as a
     * code that couldn't be sent): a sheet drawn before the change, or a
     * hand-made request, never gets through.
     */
    async assertOffered(organizationId: string, way: SignInWay): Promise<void> {
        if (!(await this.effective(organizationId)).includes(way)) {
            throw new ServiceUnavailableException({
                message: UNAVAILABLE_MESSAGE,
                details: { reason: "unavailable" },
            });
        }
    }

    /**
     * Save the business's ways and their order. Refused: no way, the same
     * way twice, SMS (not yet), WhatsApp before Saroh approves the business,
     * and email off while no other chosen way works now. Every published
     * page is revalidated, since the sign-in sheet is drawn into them.
     */
    async set(
        organizationId: string,
        ways: readonly SignInWay[],
    ): Promise<SignInWaysView> {
        if (ways.length === 0) {
            throw refused("Choose at least one way to sign in.", "NO_WAYS");
        }
        if (new Set(ways).size !== ways.length) {
            throw refused("Each way can be listed once.", "REPEATED_WAY");
        }
        if (ways.includes("SMS")) {
            throw refused(
                "Sign-in by SMS isn't available yet.",
                "SMS_NOT_AVAILABLE",
            );
        }
        if (
            ways.includes("WHATSAPP") &&
            !(await this.verification.approved(organizationId))
        ) {
            throw new ForbiddenException({
                message:
                    "WhatsApp codes for your customers aren't open to your business yet. Ask Saroh to turn them on.",
                details: { code: "PHONE_CODES_NOT_APPROVED" },
            });
        }
        if (!ways.includes("EMAIL")) {
            const whatsappWorks =
                ways.includes("WHATSAPP") &&
                (await this.whatsappBlocked(organizationId)) === null;
            if (!whatsappWorks) {
                throw refused(
                    "Keep email on until another way works: your customers would have no way to sign in.",
                    "EMAIL_NEEDED",
                );
            }
        }
        await runInOrgContext(organizationId, () =>
            prisma.$transaction(async (tx) => {
                await tx.businessProfile.upsert({
                    where: { organizationId },
                    create: { organizationId, customerSignInWays: [...ways] },
                    update: { customerSignInWays: [...ways] },
                });
                await enqueueBusinessSitesRevalidation(
                    tx,
                    organizationId,
                    "sign-in",
                );
            }),
        );
        return this.view(organizationId);
    }
}
