/**
 * What the workspace says about telling a customer (round-2 A14, R17):
 * "Saroh doesn't message them" only where nothing is sent, and what is
 * sent where something is. The API decides how a notice about a customer's
 * own booking or order reaches them (`site-accounts/notice-reach.ts`):
 *
 * - `EMAIL_AND_ACCOUNT`: emailed, and it shows in their account;
 * - `EMAIL`: emailed to the contact's own address (DEC-174 D1: a desk,
 *   phone or guest customer too, no account needed), the read naming it
 *   (`to`): "Emailed to ‹email›";
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
 * customer, naming the address when the read gives it. Unknown (an API before A14, or a failed read) says only what is
 * recorded, and claims nothing either way.
 */
export function readyNoticeText(
    reach: NoticeReach | null | undefined,
    first: string,
    to?: string | null,
): string {
    switch (reach) {
        case "EMAIL_AND_ACCOUNT":
            return to
                ? `Emailed to ${to}, and ${first} sees it in their account on your site.`
                : `${first} is emailed and sees it in their account on your site.`;
        case "EMAIL":
            return to
                ? `Emailed to ${to} when it's ready.`
                : `${first} is emailed that it's ready.`;
        case "ACCOUNT":
            return "Shown in their account on your site.";
        case "ON_SIGN_IN":
            return "They'll see it when they sign in on your site.";
        case "NONE":
            return `Nothing is sent to ${first}. The step shows on the order.`;
        default:
            return "The step shows on the order.";
    }
}

/**
 * The toast once Ready is recorded (U5, #1136): what the customer hears and
 * when. The notice is held ten seconds after the step (the API's
 * `ORDER_NOTICE_DELAY_MS`) so the toast's Undo can take it back unsent.
 * `NONE` says only that they aren't told: the reason can be no email
 * connected, no account, or email they turned off, and the read doesn't say
 * which. Unknown claims nothing either way.
 */
export function readyDoneText(
    reach: NoticeReach | null | undefined,
    first: string,
): string {
    switch (reach) {
        case "EMAIL_AND_ACCOUNT":
        case "EMAIL":
            return `${first} will be told in 10 seconds.`;
        case "ACCOUNT":
            return `${first} sees it in their account in 10 seconds.`;
        case "ON_SIGN_IN":
            return `${first} sees it when they sign in on your site.`;
        case "NONE":
            return `${first} isn't told. It shows on the order.`;
        default:
            return "It shows on the order.";
    }
}

/**
 * Undo on the Ready toast: the step it went back to, and whether the notice
 * went. `told` is the API's answer (the notice had already been written);
 * where nothing was ever sent, nothing is claimed about sending.
 */
export function readyUndoneText(
    reach: NoticeReach | null | undefined,
    first: string,
    told: boolean | undefined,
    backTo: string,
): string {
    const back = `Back to ${backTo.toLowerCase()}.`;
    if (told) return `${back} ${first} has already been told.`;
    if (reach && reach !== "NONE") return `${back} Not sent.`;
    return back;
}

/**
 * The toast once an order is Delivered or a digital order Sent (U16,
 * #1147): told like Ready, ten seconds on, while the business sends
 * delivery updates; with them off, they aren't told. Unknown claims
 * nothing either way.
 */
export function deliveryDoneText(
    reach: NoticeReach | null | undefined,
    first: string,
    deliveryUpdates: boolean | null | undefined,
): string {
    if (deliveryUpdates === false) {
        return `${first} isn't told: delivery updates are off. It shows on the order.`;
    }
    if (deliveryUpdates !== true) return "It shows on the order.";
    return readyDoneText(reach, first);
}

/**
 * The courier sheet's line on what the customer gets (U16, #1147):
 *
 * - `handover`: the "on its way" notice carries what is typed here (A14),
 *   whatever the delivery updates switch says;
 * - `change`: tracking added or changed after the handover is told once,
 *   only while the business sends delivery updates.
 *
 * Never "Nothing is sent" where something is, and never a promise where
 * nothing goes. Unknown says only that it stays on the order.
 */
export function courierNoticeText(
    reach: NoticeReach | null | undefined,
    first: string,
    opts: {
        mode: "handover" | "change";
        to?: string | null;
        deliveryUpdates?: boolean | null;
    },
): string {
    const kept = "It stays on the order.";
    if (opts.mode === "change") {
        if (opts.deliveryUpdates === false) {
            return `${kept} Nothing is sent to ${first}: delivery updates are off.`;
        }
        if (opts.deliveryUpdates !== true) return kept;
    }
    const what =
        opts.mode === "handover"
            ? "the tracking with the handover"
            : "new tracking";
    switch (reach) {
        case "EMAIL_AND_ACCOUNT":
        case "EMAIL":
            return opts.to
                ? `${kept} ${first} gets ${what} by email, at ${opts.to}.`
                : `${kept} ${first} gets ${what} by email.`;
        case "ACCOUNT":
            return `${kept} ${first} sees ${what} in their account on your site.`;
        case "ON_SIGN_IN":
            return `${kept} ${first} sees ${what} when they sign in on your site.`;
        case "NONE":
            return `${kept} Nothing is sent to ${first}.`;
        default:
            return kept;
    }
}

/**
 * The toast once tracking is saved after the handover (U16). `told` is the
 * API's answer: a notice carries it (its own, or the handover's still
 * held). Where it reaches nobody, nothing is claimed.
 */
export function trackingSavedText(
    reach: NoticeReach | null | undefined,
    first: string,
    told: boolean | undefined,
): string {
    const kept = "It stays on the order.";
    if (!told) return `${kept} Nothing is sent to ${first}.`;
    switch (reach) {
        case "EMAIL_AND_ACCOUNT":
        case "EMAIL":
            return `${kept} ${first} is emailed the tracking.`;
        case "ACCOUNT":
            return `${kept} ${first} sees it in their account on your site.`;
        case "ON_SIGN_IN":
            return `${kept} ${first} sees it when they sign in on your site.`;
        case "NONE":
            return `${kept} Nothing is sent to ${first}.`;
        default:
            return kept;
    }
}

/**
 * The booking peek's line on moving or cancelling (the design's "‹First› is
 * told"), naming the address when the read gives it ("emailed to ‹email›").
 * Unknown keeps the old advice, which asks the merchant to tell them.
 */
export function bookingChangeText(
    reach: NoticeReach | null | undefined,
    first: string,
    to?: string | null,
): string {
    switch (reach) {
        case "EMAIL_AND_ACCOUNT":
            return to
                ? `If you move or cancel, it's emailed to ${to}, and ${first} sees it in their account on your site.`
                : `If you move or cancel, ${first} is emailed and sees it in their account on your site.`;
        case "EMAIL":
            return to
                ? `If you move or cancel, it's emailed to ${to}.`
                : `If you move or cancel, ${first} is emailed.`;
        case "ACCOUNT":
            return `If you move or cancel, it shows in ${first}'s account on your site.`;
        case "ON_SIGN_IN":
            return `If you move or cancel, ${first} sees it when they sign in on your site. Tell them yourself if it's soon.`;
        default:
            return `Saroh doesn't message ${first}. Tell them yourself if you move or cancel.`;
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
        return "Each of them sees it in their account on your site, and those with an email are emailed.";
    }
    if (channels?.thread) {
        return "Each of them sees it in their account on your site.";
    }
    if (channels?.email) {
        return "Those with an email are emailed. Tell the others yourself.";
    }
    return "Saroh doesn't message them.";
}
