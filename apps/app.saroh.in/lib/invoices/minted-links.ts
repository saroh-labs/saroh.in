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

const minted = new Map<string, string>();

/** The address made for this invoice in this tab, or null. */
export function mintedLink(invoiceId: string): string | null {
    return minted.get(invoiceId) ?? null;
}

/** Keep the address just made; it replaces any made before. */
export function rememberLink(invoiceId: string, url: string): void {
    minted.set(invoiceId, url);
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
 */
export function unseenLinkLine(state: { sendable: boolean }): string {
    return `A pay link is out and still works. Its full address is shown only once, when it's made, so it can't be shown again here or on another device. ${
        state.sendable
            ? "Making a new link, or sending the invoice, ends the old one."
            : "Making a new link ends the old one."
    }`;
}

/** The confirm's body, before a new link replaces the one out. */
export function newLinkWarning(who: string): string {
    return `The link that's out stops working straight away, for anyone who has it. Send ${who} the new one.`;
}
