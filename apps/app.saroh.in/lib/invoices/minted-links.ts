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
 * - a link is out whose address this tab doesn't have: a new one, and the
 *   old one stops working;
 * - no link yet: make one.
 */
export function copyLinkLabel(state: {
    busy: boolean;
    shown: boolean;
    linkOut: boolean;
}): string {
    if (state.busy) return "Making a link…";
    if (state.shown) return "Copy link";
    if (state.linkOut) return "Copy new link (the old one stops working)";
    return "Copy pay link";
}
