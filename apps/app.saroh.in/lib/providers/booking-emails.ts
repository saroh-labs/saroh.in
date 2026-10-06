import { business } from "@/lib/settings/ready";

import type { SarohEmailState } from "./service";

/**
 * Settings → Providers' "Booking emails" block (DEC-086, U4): what Saroh
 * does with the business's booking emails while it has no email of its own,
 * in the words the screen shows. The API decides the state with the rule
 * the send follows (`saroh-email-state.ts`); this only words it.
 *
 * Saroh is not a provider the business connected, so the block sits above
 * the Available group and never in Connected.
 */

/** Where the block's main action goes: the first email provider to connect. */
export const CONNECT_EMAIL_ANCHOR = "connect-email";

/** Where a contact email is added: Business → Contact. */
export const CONTACT_EMAIL_HREF = business("contact");

export interface BookingEmailsBlock {
    tone: "sending" | "near" | "paused";
    /** The state pill. */
    pill: string;
    /** "Saroh sends your booking emails for now" / "Paused until 1 Nov". */
    status: string;
    /** "3 of 10 this month · starts again 1 Nov". */
    usage: string;
    /** What the state means and the way out. */
    body: string;
    /** Who the customer sees it from, in the email's own words. */
    sender: string;
    /** Where replies go; null when there is no contact email to reply to. */
    replyTo: string | null;
    /** Said instead of `replyTo` when there is none. */
    noReply: string | null;
}

export type BookingEmails =
    | { kind: "block"; block: BookingEmailsBlock }
    | { kind: "unread"; text: string };

const n = (v: number) => v.toLocaleString("en-IN");

const CONNECT_SENTENCE =
    "Connect your own email and they go through it, with no monthly limit.";

/** The block for a state, or null when there is nothing new to say (OFF). */
export function bookingEmailsBlock(
    state: SarohEmailState | null | undefined,
): BookingEmails | null {
    if (!state || state.state === "OFF") return null;
    if (state.state === "UNREAD") {
        return {
            kind: "unread",
            text: "Booking emails: we couldn't read whether Saroh is sending them for you, or how many are left this month. Reload the page to try again.",
        };
    }
    const { used, cap, resetsOn } = state;
    const usage = `${n(used)} of ${n(cap)} this month · starts again ${resetsOn}`;
    const common = {
        usage,
        sender: `"${state.sender.name}" <${state.sender.address}>`,
        replyTo: state.replyTo,
        noReply: state.replyTo
            ? null
            : "Customers can't reply to these yet: they're asked to message you from their account on your site. Add a contact email and replies come to you.",
    };
    if (state.state === "PAUSED") {
        return {
            kind: "block",
            block: {
                ...common,
                tone: "paused",
                pill: "Paused",
                status: `Paused until ${resetsOn}`,
                body: `Saroh has sent all ${n(cap)} booking emails your plan includes this month. Customers still see each booking update in their account on your site. ${CONNECT_SENTENCE}`,
            },
        };
    }
    const near = state.state === "NEAR";
    return {
        kind: "block",
        block: {
            ...common,
            tone: near ? "near" : "sending",
            pill: near ? "Nearly used" : "Saroh sending",
            status: "Saroh sends your booking emails for now",
            body: near
                ? `At ${n(cap)}, Saroh stops sending them until ${resetsOn}. ${CONNECT_SENTENCE}`
                : `Confirmed, moved and cancelled bookings, counted against your plan. ${CONNECT_SENTENCE}`,
        },
    };
}

/** Whether Saroh is the one sending booking emails now, or would once the month starts again. */
export function sarohRouteOn(state: SarohEmailState | null | undefined) {
    return (
        state?.state === "SENDING" ||
        state?.state === "NEAR" ||
        state?.state === "PAUSED"
    );
}
