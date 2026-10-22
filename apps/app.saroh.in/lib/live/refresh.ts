/**
 * The screen updates by itself (10 Oct 2026): the rules, apart from the
 * hook that runs them (`components/shared/live-refresh/use-live-refresh.ts`), so they
 * can be tested without a browser.
 *
 * Nothing here fetches. "Refresh" is `router.refresh()`: the server reads
 * the page again and React keeps what is on screen (open rows, scroll,
 * anything typed).
 *
 * Pure and client-safe.
 */

/** How often a live page reads again while its tab is in view. */
export const LIVE_INTERVAL_MS = 45_000;

/**
 * The pages that read again on a timer: the ones left open on a counter
 * to watch. Exact addresses, never a record's own page: Home, the Orders
 * list and its kitchen tickets, the bookings calendar and list, and
 * Notifications. Every other page reads again only when its tab is come
 * back to, or the connection returns.
 */
export const LIVE_ROUTES = [
    "/",
    "/commerce/orders",
    "/commerce/orders/tickets",
    "/bookings",
    "/bookings/all",
    "/notifications",
] as const;

export function isLiveRoute(pathname: string | null | undefined): boolean {
    if (!pathname) return false;
    const path =
        pathname.length > 1 && pathname.endsWith("/")
            ? pathname.slice(0, -1)
            : pathname;
    return (LIVE_ROUTES as readonly string[]).includes(path);
}

/*
 * The shared "busy" signal. A screen holding unsaved work says so here,
 * and nothing reads the page again while it does: `useLeaveGuard` holds it
 * for every guarded form while it is dirty, so no screen has to remember.
 */
let holds = 0;

/** Hold live refresh; call the returned function to let go (once). */
export function holdLiveRefresh(): () => void {
    holds += 1;
    let held = true;
    return () => {
        if (!held) return;
        held = false;
        holds -= 1;
    };
}

export function liveRefreshHeld(): boolean {
    return holds > 0;
}

/** The parts of a document `pageBusy` reads; a jsdom or a stand-in. */
export interface BusyDocument {
    querySelector(selectors: string): unknown;
    activeElement?: unknown;
}

/** A sheet, a dialog, a confirm or the command menu is open. */
const OPEN_OVERLAY = '[role="dialog"], [role="alertdialog"]';

/** A field someone has typed into and not yet sent (see `markTyped`). */
const TYPED = "[data-live-typed]";

function isEditable(el: unknown): boolean {
    if (typeof el !== "object" || el === null) return false;
    const node = el as {
        tagName?: string;
        type?: string;
        isContentEditable?: boolean;
    };
    if (node.isContentEditable) return true;
    const tag = node.tagName?.toUpperCase();
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag !== "INPUT") return false;
    // A search box narrows a list; it holds no work.
    return !["search", "checkbox", "radio", "button", "submit"].includes(
        node.type ?? "text",
    );
}

/**
 * Why the page must not be read again just now, or null when it may:
 * something is open over it, a guarded form is dirty, a field is being
 * typed in, or a form on the page was typed into and not sent.
 */
export function pageBusy(
    doc: BusyDocument,
): "overlay" | "held" | "typing" | "typed" | null {
    if (doc.querySelector(OPEN_OVERLAY)) return "overlay";
    if (liveRefreshHeld()) return "held";
    if (isEditable(doc.activeElement)) return "typing";
    if (doc.querySelector(TYPED)) return "typed";
    return null;
}

/**
 * Mark the form a field belongs to as typed into, on the form itself, so
 * the mark goes when the form does (a sheet closing, a navigation). A
 * search box marks nothing. `clearTyped` takes it off when the form sends.
 */
export function markTyped(target: unknown): void {
    if (!isEditable(target)) return;
    const form = (
        target as { closest?: (s: string) => Element | null }
    ).closest?.("form");
    form?.setAttribute("data-live-typed", "");
}

export function clearTyped(target: unknown): void {
    (
        target as { removeAttribute?: (name: string) => void } | null
    )?.removeAttribute?.("data-live-typed");
}

/** "(3) " as a tab title starts when there is something unread. */
const UNREAD_PREFIX = /^\(\d+\+?\)\s+/;

/**
 * The tab's title with the unread count in front: "(3) Orders · Saroh".
 * Nothing in front at zero, or when the count isn't known (a role with no
 * inbox). Past 99 it reads "(99+)". Safe to apply to its own answer.
 */
export function titleWithUnread(
    title: string,
    unread: number | null | undefined,
): string {
    const bare = title.replace(UNREAD_PREFIX, "");
    if (!unread || unread < 1) return bare;
    return `(${unread > 99 ? "99+" : Math.floor(unread)}) ${bare}`;
}
