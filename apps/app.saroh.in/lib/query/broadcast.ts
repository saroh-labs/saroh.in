/**
 * Tells this browser's other tabs that the business changed or the person
 * signed out, so each drops its cache (DEC-259). `active_org` is one cookie
 * for every tab: a tab still holding the last business's rows would show
 * them under the new one.
 *
 * A tab never hears its own message. BroadcastChannel only skips the one
 * channel object that sent it, and `announce` opens its own, so a tab's
 * listener would hear it: the switching tab then cleared its cache and drew
 * the page a second time (24 Nov 2026). Each message carries this tab's id,
 * and the listener drops its own. Without BroadcastChannel (an older
 * WebView) it does nothing: that tab refreshes its own cache on its next
 * server render, as today.
 */

/**
 * `settings`: a save here changed what the settings reads answer (a module,
 * the plan, a site, Ask AI); the other tabs read theirs again.
 */
export type BroadcastKind = "switch" | "signout" | "settings";

const CHANNEL = "saroh-query";

/** This tab, so it can tell its own messages apart. */
const TAB = Math.random().toString(36).slice(2);

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
    c.postMessage({ kind, from: TAB });
    c.close();
}

/** Hear the other tabs. Returns the stop. */
export function listen(onMessage: (kind: BroadcastKind) => void): () => void {
    const c = channel();
    if (!c) return () => undefined;
    c.onmessage = (e: MessageEvent<unknown>) => {
        const data = e.data as { kind?: unknown; from?: unknown } | null;
        if (data?.from === TAB) return;
        const kind = data?.kind;
        if (kind === "switch" || kind === "signout" || kind === "settings") {
            onMessage(kind);
        }
    };
    return () => c.close();
}
