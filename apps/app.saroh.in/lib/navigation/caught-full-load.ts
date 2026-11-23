/**
 * A failed client navigation, caught in its region instead of a full page
 * load (owner, 21 Nov: "the frame stays").
 *
 * When the fetch behind a soft navigation fails (no network, a gateway
 * error), Next falls back to `location.assign(url)`, a full page load that
 * throws the editor's frame away (`app-router.js`, its own TODO: "Should we
 * listen to navigateerror here to catch failed navigations?"). While a
 * region is waiting on a navigation it `arm`s a catch: the Navigation API's
 * `navigate` event for that cross-document load is cancelled and the region
 * says "Couldn't load" with Try again. `retry` puts Next's router back on
 * the page it was on (its own bfcache restore, `pageshow`) and lets the
 * next failure through, so a sign-in redirect or a new deploy still loads.
 *
 * shortcut: needs the Navigation API (Chrome, Edge, Safari 26.2+,
 * Firefox 147+); without it Next's full page load happens as before.
 */

interface NavigateEventLike extends Event {
    cancelable: boolean;
    navigationType: string;
    destination: { url: string; sameDocument: boolean };
}

interface NavigationLike {
    addEventListener: (type: "navigate", fn: (e: Event) => void) => void;
    removeEventListener: (type: "navigate", fn: (e: Event) => void) => void;
}

function navigation(): NavigationLike | null {
    if (typeof window === "undefined") return null;
    return (window as { navigation?: NavigationLike }).navigation ?? null;
}

/** Whether a failed navigation can be caught in this browser. */
export function canCatchFullLoad(): boolean {
    return navigation() !== null;
}

/**
 * Catch Next's full-page fallback to an address `match` accepts, once.
 * Returns the disarm. `onCaught` runs when one was stopped.
 */
export function armFullLoadCatch(
    match: (url: URL) => boolean,
    onCaught: (url: URL) => void,
): () => void {
    const nav = navigation();
    if (!nav) return () => undefined;
    const onNavigate = (event: Event) => {
        const e = event as NavigateEventLike;
        if (e.destination.sameDocument || !e.cancelable) return;
        if (e.navigationType !== "push" && e.navigationType !== "replace") {
            return;
        }
        const url = new URL(e.destination.url);
        if (url.origin !== window.location.origin || !match(url)) return;
        e.preventDefault();
        nav.removeEventListener("navigate", onNavigate);
        // Next asks for the load from inside its router's render: what the
        // region does about it (a state, the router's reset) waits for that
        // render to end, or React drops it and the screen stays stuck.
        setTimeout(() => onCaught(url), 0);
    };
    nav.addEventListener("navigate", onNavigate);
    return () => nav.removeEventListener("navigate", onNavigate);
}

/**
 * After a caught failure, Next's router still holds the full load it asked
 * for (and won't ask for it twice). Its bfcache restore clears that and
 * draws the page in the address bar again (`handlePageShow` in
 * `app-router.js`).
 */
export function resetRouterAfterCatch(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
    );
}

/**
 * Whether a caught full load was a real failure: the address answers (a
 * page, or a redirect such as sign-in) or it doesn't (offline, a gateway
 * error). Next also loads in full on purpose (a new deploy), and a script
 * can ask for one: those must go through, not say "Couldn't load".
 */
export async function answers(url: URL): Promise<boolean> {
    try {
        const res = await fetch(url, {
            method: "HEAD",
            redirect: "manual",
            cache: "no-store",
            credentials: "same-origin",
        });
        return res.ok || res.type === "opaqueredirect";
    } catch {
        return false;
    }
}
