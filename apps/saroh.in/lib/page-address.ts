/* eslint-disable @typescript-eslint/unbound-method -- the browser's own
   history functions are held as they are, so they can be put back, and are
   only ever called with their history (`.call(history, …)`). */
/**
 * What a third party's tag may see of a saroh.in page's address (DEC-127).
 *
 * Google's tag and the Meta Pixel both report the address of the page they
 * are on. Some of what an address carries is about somebody else: `ref` is
 * another entrant's referral id, and `invite`, `email`, `token`, `next` or
 * a site being reported are no business of an ad platform's. So before any
 * tag loads, the address is cut back to what is on one allow-list, here,
 * and it is the address itself that is cut (the browser's address bar), so
 * there is nothing left for a tag to read, whichever way it looks.
 *
 * - **One allow-list**, {@link mayStay}: the page's own choices (`plan`,
 *   `src`, `template`) and campaign data (`utm_…`, and the ad platforms' own
 *   click ids). Everything else goes, a parameter nobody has thought about
 *   included.
 * - **The page reads first.** What is cut is kept for this tab, by page, and
 *   {@link readAddress} gives it back, so a referral still counts and a
 *   form is still filled in. A page on saroh.in reads its query through
 *   `readAddress`, never from `location.search`.
 * - **Every later address too.** {@link guardHistory} cuts an address the
 *   same way as it is pushed, so a tag listening for page changes never
 *   sees one whole.
 */
const KEPT = new Set([
    "plan",
    "src",
    "template",
    // Click ids the ad platforms add to their own links.
    "gclid",
    "gbraid",
    "wbraid",
    "fbclid",
]);

/** Whether a query parameter may stay in an address a tag can read. */
export function mayStay(name: string, value = ""): boolean {
    if (!KEPT.has(name) && !/^utm_[a-z]+$/.test(name)) return false;
    // Campaign data never holds an address someone can be written to.
    return !value.includes("@");
}

/**
 * A query split in two, each as a query string with no `?`: what may stay
 * in the address, and what is cut from it.
 */
export function splitSearch(search: string): { kept: string; cut: string } {
    const kept = new URLSearchParams();
    const cut = new URLSearchParams();
    new URLSearchParams(search).forEach((value, name) => {
        (mayStay(name, value) ? kept : cut).append(name, value);
    });
    return { kept: kept.toString(), cut: cut.toString() };
}

/**
 * An address as a tag may be told it: the page and the query that may stay,
 * with no fragment. Given to Google's tag as `page_location` with every
 * event saroh.in sends.
 */
export function cleanUrl(href: string): string {
    const url = new URL(href);
    const { kept } = splitSearch(url.search);
    return `${url.origin}${url.pathname}${kept ? `?${kept}` : ""}`;
}

const storeKey = (pathname: string) => `saroh-address:${pathname}`;

/** For a browser that blocks storage: what was cut, for this page load. */
let remembered: Record<string, string> = {};

function keep(win: Window, pathname: string, cut: string): void {
    remembered[pathname] = cut;
    try {
        win.sessionStorage.setItem(storeKey(pathname), cut);
    } catch {
        // Storage is blocked; the page's own memory holds it.
    }
}

function kept(win: Window, pathname: string): string {
    try {
        const stored = win.sessionStorage.getItem(storeKey(pathname));
        if (stored !== null) return stored;
    } catch {
        // Storage is blocked.
    }
    return remembered[pathname] ?? "";
}

/**
 * The page's query as it was opened (`?…`, or empty): what is in the
 * address now, with what was cut from this page's address in this tab put
 * back. Where both name a parameter, the address wins.
 */
export function readAddress(win: Window = window): string {
    const query = new URLSearchParams(kept(win, win.location.pathname));
    const now = new URLSearchParams(win.location.search);
    now.forEach((_value, name) => query.delete(name));
    now.forEach((value, name) => query.append(name, value));
    const all = query.toString();
    return all ? `?${all}` : "";
}

type HistoryCall = History["pushState"];
let guarded: {
    history: History;
    push: HistoryCall;
    replace: HistoryCall;
} | null = null;

/**
 * Cuts the address back to what may stay, keeping what it cut for
 * {@link readAddress}. Called before a tag loads (`lib/tags.ts`).
 */
export function takeAddress(win: Window = window): void {
    const { kept: stays, cut } = splitSearch(win.location.search);
    if (!cut) return;
    keep(win, win.location.pathname, cut);
    const replace = guarded?.replace ?? win.history.replaceState;
    replace.call(
        win.history,
        win.history.state,
        "",
        `${win.location.pathname}${stays ? `?${stays}` : ""}${win.location.hash}`,
    );
}

/**
 * From here on, every address this page moves to (a link followed in the
 * app, a tool writing its state into the address) is cut the same way as it
 * is set, before anything listening for the change can read it. Once per
 * page.
 */
export function guardHistory(win: Window = window): void {
    if (guarded) return;
    const history = win.history;
    const push = history.pushState;
    const replace = history.replaceState;
    guarded = { history, push, replace };
    const cutting =
        (set: HistoryCall): HistoryCall =>
        (state, unused, url) => {
            if (url === undefined || url === null) {
                set.call(history, state, unused);
                return;
            }
            let target: URL;
            try {
                target = new URL(String(url), win.location.href);
            } catch {
                set.call(history, state, unused, url);
                return;
            }
            const { kept: stays, cut } = splitSearch(target.search);
            if (!cut || target.origin !== win.location.origin) {
                set.call(history, state, unused, url);
                return;
            }
            keep(win, target.pathname, cut);
            set.call(
                history,
                state,
                unused,
                `${target.pathname}${stays ? `?${stays}` : ""}${target.hash}`,
            );
        };
    history.pushState = cutting(push);
    history.replaceState = cutting(replace);
}

/** For tests: nothing cut, nothing kept, the browser's own history calls. */
export function resetAddress(win: Window = window): void {
    if (guarded) {
        guarded.history.pushState = guarded.push;
        guarded.history.replaceState = guarded.replace;
        guarded = null;
    }
    remembered = {};
    try {
        win.sessionStorage.clear();
    } catch {
        // Storage is blocked.
    }
}
