/**
 * The pay links made in this browser tab, by invoice (UX-048).
 *
 * The API keeps only a pay link's hash, so its address is shown once, when
 * it is made: it can't be read back. A link copied while the clipboard was
 * blocked, or from a quick look since closed, would be lost, and copying
 * again makes a new one and retires it. So the address is kept here, in
 * memory, for as long as the tab is open: "Show link again" reads it, and
 * never makes a new one. Nothing is stored in the browser: a reload forgets
 * it, and then a new link is the only way, said honestly on the button.
 */

/**
 * A link this tab made. `madeAt` is when the API says it was made (#870):
 * the invoice keeps that date beside the token's hash, and a read naming
 * another date means another token is out. Without it (an older API) the
 * invoice's `updatedAt` stands in: `before` is the one this tab knew when
 * the link was made, and `seen` the first one read after. Making a link
 * changes the invoice, so that first later read is the link's own; any
 * later change means something else may have replaced the token.
 */
interface Held {
    url: string;
    madeAt: number | null;
    before: number | null;
    seen: number | null;
}

const minted = new Map<string, Held>();

/** Only an unpaid invoice's link takes payment; paid or void, it is gone. */
const LIVE = new Set(["ISSUED", "OVERDUE"]);

/** How the invoice stands now, from the latest read of it. */
export interface LinkState {
    standing?: string | null;
    updatedAt?: string | null;
    /**
     * When the link that is out was made (#870); null when none is out or
     * its date wasn't kept; absent from an older API.
     */
    payLinkMadeAt?: string | null;
}

function time(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : t;
}

/**
 * The address made for this invoice in this tab, or null. Given how the
 * invoice stands now, it is forgotten once it can't be the link that is
 * out: the invoice is paid, void or cancelled, or another link replaced it
 * — a send, a reminder, a view link, or the customer's own "Pay now" on
 * their account each make a new one and end this one.
 *
 * Where both dates are known, the link's own date decides (#870): any
 * other change to the invoice, an edited note or a payment recorded
 * elsewhere, leaves the token alone and the link shown.
 */
export function mintedLink(invoiceId: string, now?: LinkState): string | null {
    const held = minted.get(invoiceId);
    if (!held) return null;
    if (!now) return held.url;
    if (now.standing && !LIVE.has(now.standing)) {
        minted.delete(invoiceId);
        return null;
    }
    if (held.madeAt !== null && now.payLinkMadeAt !== undefined) {
        return byMadeAt(invoiceId, held, held.madeAt, now);
    }
    // An older API, or a link made before the date was answered.
    const at = time(now.updatedAt);
    // Read from before the link was made, or nothing to compare.
    if (at === null || (held.before !== null && at <= held.before)) {
        return held.url;
    }
    // The first read after it was made: the change was the link itself.
    if (held.seen === null) {
        held.seen = at;
        return held.url;
    }
    if (at > held.seen) {
        minted.delete(invoiceId);
        return null;
    }
    return held.url;
}

/**
 * The link's date against the read's (#870). The same date: it is the one
 * out. A later one: something made another. An earlier one, or none, is a
 * read from before this link was made — unless the invoice changed after
 * it, when the link was cleared (a deleted contact, say).
 */
function byMadeAt(
    invoiceId: string,
    held: Held,
    made: number,
    now: LinkState,
): string | null {
    const out = time(now.payLinkMadeAt);
    if (out === made) return held.url;
    const changedSince =
        (time(now.updatedAt) ?? Number.NEGATIVE_INFINITY) > made;
    if ((out !== null && out > made) || (out === null && changedSince)) {
        minted.delete(invoiceId);
        return null;
    }
    return held.url;
}

/**
 * Keep the address just made; it replaces any made before. `updatedAt` is
 * the invoice's as this tab knew it before the link was made; `madeAt` the
 * link's date as the API answered it (#870), when it did.
 */
export function rememberLink(
    invoiceId: string,
    url: string,
    updatedAt?: string | null,
    madeAt?: string | null,
): void {
    minted.set(invoiceId, {
        url,
        madeAt: time(madeAt),
        before: time(updatedAt),
        seen: null,
    });
}

/**
 * Something replaced this invoice's link (a send, a reminder, a view link):
 * the address kept here no longer works, so it isn't shown again.
 */
export function forgetLink(invoiceId: string): void {
    minted.delete(invoiceId);
}

/** For tests: start with nothing remembered. */
export function forgetLinks(): void {
    minted.clear();
}

/**
 * The quick look's copy button, in words that say what it does:
 * - a link made in this tab is shown: copy that one, nothing new is made;
 * - a link is out whose address this tab doesn't have: "Make a new link",
 *   confirmed first, because the old one stops working;
 * - no link yet: make one.
 */
export function copyLinkLabel(state: {
    busy: boolean;
    shown: boolean;
    linkOut: boolean;
}): string {
    if (state.busy) return "Making a link…";
    if (state.shown) return "Copy link";
    if (state.linkOut) return UNSEEN_LINK.action;
    return "Copy pay link";
}

/**
 * How an invoice's pay link stands from this tab (UX-048):
 * - `none`: no link is out;
 * - `held`: one is out and this tab made it, so "Show link again";
 * - `unseen`: one is out that this tab didn't make — after a reload, on
 *   another device, or made by sending the invoice. Its address can't be
 *   shown (owner, 8 Oct: the API keeps only its hash, never the token), so
 *   the screen says so and offers a new link, saying first that it ends
 *   the old one.
 */
export type LinkSight = "none" | "held" | "unseen";

export function linkSight(state: {
    linkOut: boolean;
    held: boolean;
}): LinkSight {
    if (state.held) return "held";
    return state.linkOut ? "unseen" : "none";
}

/** The words for a link that is out but can't be shown (UX-048). */
export const UNSEEN_LINK = {
    action: "Make a new link",
    confirmTitle: "Make a new pay link?",
    confirmLabel: "Make a new link",
    cancelLabel: "Keep the old one",
} as const;

/**
 * Why the link that is out isn't shown, and what a new one costs. Sending
 * the invoice makes a new link too, so where it can be sent, that is said.
 * `madeOn` is the day it was made, already written (#870); without one the
 * line says only that a link is out.
 */
export function unseenLinkLine(state: {
    sendable: boolean;
    madeOn?: string | null;
}): string {
    const lead = state.madeOn
        ? `A pay link was made on ${state.madeOn} and still works.`
        : "A pay link is out and still works.";
    return `${lead} Its full address is shown only once, when it's made, so it can't be shown again here or on another device. ${
        state.sendable
            ? "Making a new link, or sending the invoice, ends the old one."
            : "Making a new link ends the old one."
    }`;
}

/** The confirm's body, before a new link replaces the one out. */
export function newLinkWarning(who: string): string {
    return `The link that's out stops working straight away, for anyone who has it. Send ${who} the new one.`;
}
