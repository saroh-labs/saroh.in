import { HttpException, HttpStatus } from "@nestjs/common";
import { createHash } from "node:crypto";

import { env } from "../../env";
import type { WindowLimiter } from "../rate-limits/shared-window";
import { SharedRateLimiter } from "../rate-limits/shared-window";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The windows one send is counted in, each a day long. */
export interface InviteWindows {
    /** One business's sends, business and location invites together. */
    business: WindowLimiter;
    /** One business to one address. */
    businessAddress: WindowLimiter;
    /** One address from every business: larger, so a stranger's business can't use it all. */
    address: WindowLimiter;
    /** One signed-in account, across every business it can invite for. */
    inviter: WindowLimiter;
    /** Every invitation Saroh sends. */
    overall: WindowLimiter;
}

const window = (name: string, limit: number) =>
    new SharedRateLimiter(name, limit, DAY_MS);

function defaultWindows(): InviteWindows {
    return {
        business: window(
            "invite-sends-business",
            Number(env.INVITE_SENDS_PER_BUSINESS_PER_DAY) || 50,
        ),
        businessAddress: window("invite-sends-business-email", 3),
        address: window(
            "invite-sends-email",
            Number(env.INVITE_SENDS_PER_EMAIL_PER_DAY) || 10,
        ),
        inviter: window("invite-sends-inviter", 100),
        overall: window("invite-sends-overall", 5000),
    };
}

/**
 * One address however it is written: lower-case, no `+tag`, and for Gmail
 * no dots (07 F4), so `x+1@` and `x.y@gmail.com` don't buy a fresh budget.
 */
export function inviteAddressKey(email: string): string {
    const lower = email.trim().toLowerCase();
    const at = lower.lastIndexOf("@");
    if (at < 1) return lower;
    let local = lower.slice(0, at).split("+")[0] || lower.slice(0, at);
    let domain = lower.slice(at + 1);
    if (domain === "gmail.com" || domain === "googlemail.com") {
        local = local.replaceAll(".", "");
        domain = "gmail.com";
    }
    return `${local}@${domain}`;
}

const hashed = (value: string) =>
    createHash("sha256").update(value).digest("hex");

const BUSY = {
    address:
        "That address has had enough invitations today. Try again tomorrow.",
    business:
        "Your business has sent enough invitations today. Try again tomorrow.",
    inviter: "You've sent enough invitations today. Try again tomorrow.",
    overall: "Invitations are busy right now. Try again later.",
};

/**
 * Invitation emails, counted per send (A-02, 07 F4) in Redis
 * (`SharedRateLimiter`). Withdrawing and inviting again is one more send
 * each time, so seats no longer bound how many mails go out. Callers take
 * it after their permission and seat checks, so a refused invite costs
 * nothing.
 */
export class InviteSendLimit {
    private readonly windows: InviteWindows;

    constructor(windows: Partial<InviteWindows> = {}) {
        this.windows = { ...defaultWindows(), ...windows };
    }

    /** Count one send, or refuse it (429) before it is sent. */
    async take(
        organizationId: string,
        inviterUserId: string,
        email: string,
    ): Promise<void> {
        const to = hashed(inviteAddressKey(email));
        // The caller's own windows first, the shared ones last, stopping at
        // the first refusal: a business past its share never counts against
        // the address's window, so it can't use up anyone else's.
        const keys: Record<keyof InviteWindows, string> = {
            businessAddress: `${organizationId}:${to}`,
            business: organizationId,
            inviter: inviterUserId,
            address: to,
            overall: "all",
        };
        let refused: keyof InviteWindows | undefined;
        for (const name of Object.keys(keys) as (keyof InviteWindows)[]) {
            if (!(await this.windows[name].take(keys[name]))) {
                refused = name;
                break;
            }
        }
        if (!refused) return;
        const wait = await this.windows[refused].retryAfterSeconds(
            keys[refused],
        );
        throw new HttpException(
            {
                message:
                    BUSY[refused === "businessAddress" ? "address" : refused],
                details: { reason: "limit", retryAfter: wait },
            },
            HttpStatus.TOO_MANY_REQUESTS,
        );
    }
}

/** The API's one instance, shared by business and location invites. */
export const inviteSendLimit = new InviteSendLimit();
