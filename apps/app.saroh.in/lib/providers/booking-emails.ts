import { upgradeHref } from "@/lib/billing/access";
import { businessEditHref } from "@/lib/organizations/business-rows";

import type { SarohEmailState } from "./service";

/**
 * Settings → Providers' "Booking emails" block (DEC-086, U4): what Saroh
 * does with the business's booking emails while it has no email of its own,
 * in the words the screen shows. The API decides the state with the rule
 * the send follows (`saroh-email-state.ts`); this only words it.
 *
 * Saroh is not a provider the business connected, so the block sits above
 * the Available group and never in Connected. Its way out is connecting the
 * business's own email, only where its plan has room for one; on a plan
 * without it (Free), seeing plans (DEC-086).
 */

/** Where the block's main action goes: the first email provider to connect. */
export const CONNECT_EMAIL_ANCHOR = "connect-email";

/** Where a contact email is added: Business → Contact, its sheet open. */
export const CONTACT_EMAIL_HREF = businessEditHref("contactEmail");

/** Where the block sends a business that can't connect its own email yet. */
export const SEE_PLANS_HREF = upgradeHref();

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
    /**
     * The main action: connect its own email (its plan has room), see
     * plans (it doesn't: Free, DEC-086), or none when that couldn't be
     * read — never an offer the connect would refuse.
     */
    own: "connect" | "upgrade" | "unread";
}

export type BookingEmails =
    | { kind: "block"; block: BookingEmailsBlock }
    | { kind: "unread"; text: string };

const n = (v: number) => v.toLocaleString("en-IN");

/** The way out, by whether the business can connect its own email. */
const OWN_SENTENCE = {
    connect:
        "Connect your own email and they go through it, with no monthly limit.",
    upgrade:
        "A higher plan lets you connect your own email, and then they go through it with no monthly limit.",
    unread: "We couldn't read whether your plan lets you connect your own email. Reload the page to try again.",
} as const;

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
    // An API that predates the field offered connecting, as before.
    const own: BookingEmailsBlock["own"] =
        state.canConnectOwn === undefined || state.canConnectOwn === true
            ? "connect"
            : state.canConnectOwn === false
              ? "upgrade"
              : "unread";
    const way = OWN_SENTENCE[own];
    const usage = `${n(used)} of ${n(cap)} this month · starts again ${resetsOn}`;
    const common = {
        usage,
        sender: `"${state.sender.name}" <${state.sender.address}>`,
        replyTo: state.replyTo,
        own,
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
                body: `Saroh has sent all ${n(cap)} booking emails your plan includes this month. Customers still see each booking update in their account on your site. ${way}`,
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
                ? `At ${n(cap)}, Saroh stops sending them until ${resetsOn}. ${way}`
                : `Confirmed, moved and cancelled bookings, counted against your plan. ${way}`,
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
