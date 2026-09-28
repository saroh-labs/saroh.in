/**
 * What the workspace says about telling a customer (round-2 A14, R17):
 * "Saroh doesn't message them" only where nothing is sent, and what is
 * sent where something is. The API decides how a notice about a customer's
 * own booking or order reaches them (`site-accounts/notice-reach.ts`):
 *
 * - `EMAIL_AND_ACCOUNT`: emailed, and it shows in their account;
 * - `EMAIL`: emailed (the account thread isn't live);
 * - `ACCOUNT`: shown in their account on the business's site;
 * - `ON_SIGN_IN`: no account yet; they see it when they sign in;
 * - `NONE`: nothing is sent.
 *
 * Pure, so the client screens and tests share it.
 */

export type NoticeReach =
    "EMAIL_AND_ACCOUNT" | "EMAIL" | "ACCOUNT" | "ON_SIGN_IN" | "NONE";

/** What the business can use at all: its own email, and the account thread. */
export interface NoticeChannels {
    email: boolean;
    thread: boolean;
}

const REACHES: readonly NoticeReach[] = [
    "EMAIL_AND_ACCOUNT",
    "EMAIL",
    "ACCOUNT",
    "ON_SIGN_IN",
    "NONE",
];

export function isNoticeReach(value: unknown): value is NoticeReach {
    return (REACHES as readonly unknown[]).includes(value);
}

/**
 * The Ready hold's line on Order Detail: what marking it ready tells the
 * customer. Unknown (an API before A14, or a failed read) says only what is
 * recorded, and claims nothing either way.
 */
export function readyNoticeText(
    reach: NoticeReach | null | undefined,
    first: string,
): string {
    switch (reach) {
        case "EMAIL_AND_ACCOUNT":
            return `${first} is emailed and sees it in their account on your site.`;
        case "EMAIL":
            return `${first} is emailed that it's ready.`;
        case "ACCOUNT":
            return "Shown in their account on your site.";
        case "ON_SIGN_IN":
            return "They'll see it when they sign in on your site.";
        case "NONE":
            return `Nothing is sent to ${first} — the step shows on the order.`;
        default:
            return "The step shows on the order.";
    }
}

/**
 * The booking peek's line on moving or cancelling (the design's "‹First› is
 * told"). Unknown keeps the old advice, which asks the merchant to tell them.
 */
export function bookingChangeText(
    reach: NoticeReach | null | undefined,
    first: string,
): string {
    switch (reach) {
        case "EMAIL_AND_ACCOUNT":
            return `If you move or cancel, ${first} is emailed and sees it in their account on your site.`;
        case "EMAIL":
            return `If you move or cancel, ${first} is emailed.`;
        case "ACCOUNT":
            return `If you move or cancel, it shows in ${first}'s account on your site.`;
        case "ON_SIGN_IN":
            return `If you move or cancel, ${first} sees it when they sign in on your site — tell them yourself if it's soon.`;
        default:
            return `Saroh doesn't message ${first} — tell them yourself if you move or cancel.`;
    }
}

/**
 * Cancelling a whole class: what everyone booked on it hears. Each person's
 * reach differs, so this speaks from what the business can use.
 */
export function classCancelText(
    channels: NoticeChannels | null | undefined,
): string {
    if (channels?.thread && channels.email) {
        return "Each of them sees it in their account on your site, and those who've signed in there are emailed.";
    }
    if (channels?.thread) {
        return "Each of them sees it in their account on your site.";
    }
    if (channels?.email) {
        return "Those who've signed in on your site are emailed; tell the others yourself.";
    }
    return "Saroh doesn't message them.";
}
