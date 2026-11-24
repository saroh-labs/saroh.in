/**
 * Tells this browser's other tabs that the business changed or the person
 * signed out, so each drops its cache (DEC-259). `active_org` is one cookie
 * for every tab: a tab still holding the last business's rows would show
 * them under the new one.
 *
 * A tab never hears its own message (BroadcastChannel doesn't deliver to
 * the sender), so there is no echo loop. Without BroadcastChannel (an older
 * WebView) it does nothing: that tab refreshes its own cache on its next
 * server render, as today.
 */

export type BroadcastKind = "switch" | "signout";

const CHANNEL = "saroh-query";

function channel(): BroadcastChannel | null {
    if (typeof BroadcastChannel === "undefined") return null;
    try {
        return new BroadcastChannel(CHANNEL);
    } catch {
        return null;
    }
}

/** Tell the other tabs. */
export function announce(kind: BroadcastKind): void {
    const c = channel();
    if (!c) return;
    c.postMessage({ kind });
    c.close();
}

/** Hear the other tabs. Returns the stop. */
export function listen(onMessage: (kind: BroadcastKind) => void): () => void {
    const c = channel();
    if (!c) return () => undefined;
    c.onmessage = (e: MessageEvent<unknown>) => {
        const kind = (e.data as { kind?: unknown } | null)?.kind;
        if (kind === "switch" || kind === "signout") onMessage(kind);
    };
    return () => c.close();
}
