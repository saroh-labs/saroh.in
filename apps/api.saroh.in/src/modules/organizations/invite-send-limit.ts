import { HttpException, HttpStatus } from "@nestjs/common";
import { createHash } from "node:crypto";

import { env } from "../../env";
import type { WindowLimiter } from "../rate-limits/shared-window";
import { SharedRateLimiter } from "../rate-limits/shared-window";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PER_BUSINESS = 50;
const DEFAULT_PER_EMAIL = 5;

/**
 * Invitation emails, counted per send (A-02): a business's budget, business
 * and location invites together, and one per recipient address across every
 * business. Withdrawing and inviting again is one more send each time, so
 * seats no longer bound how many mails go out. In Redis (`SharedRateLimiter`).
 */
export class InviteSendLimit {
    constructor(
        private readonly perBusiness: WindowLimiter = new SharedRateLimiter(
            "invite-sends-business",
            Number(env.INVITE_SENDS_PER_BUSINESS_PER_DAY) ||
                DEFAULT_PER_BUSINESS,
            DAY_MS,
        ),
        private readonly perEmail: WindowLimiter = new SharedRateLimiter(
            "invite-sends-email",
            Number(env.INVITE_SENDS_PER_EMAIL_PER_DAY) || DEFAULT_PER_EMAIL,
            DAY_MS,
        ),
    ) {}

    /** Count one send, or refuse it (429) before anything is written. */
    async take(organizationId: string, email: string): Promise<void> {
        const to = createHash("sha256")
            .update(email.trim().toLowerCase())
            .digest("hex");
        const [business, address] = await Promise.all([
            this.perBusiness.take(organizationId),
            this.perEmail.take(to),
        ]);
        if (business && address) return;
        const wait = business
            ? await this.perEmail.retryAfterSeconds(to)
            : await this.perBusiness.retryAfterSeconds(organizationId);
        throw new HttpException(
            {
                message: business
                    ? "That address has had enough invitations today. Try again tomorrow."
                    : "Your business has sent enough invitations today. Try again tomorrow.",
                details: { reason: "limit", retryAfter: wait },
            },
            HttpStatus.TOO_MANY_REQUESTS,
        );
    }
}

/** The API's one instance, shared by business and location invites. */
export const inviteSendLimit = new InviteSendLimit();
