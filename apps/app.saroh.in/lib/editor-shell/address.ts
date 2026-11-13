/**
 * When a new record's address may change (UX-080).
 *
 * The first autosave of a new plan or pack creates it as a Draft, and the
 * address becomes its edit page (`/new` → `/<id>/edit`), so a reload or a
 * shared link lands on the record. Done at once, the address jumped while
 * the merchant was still typing its name. So it waits until they are not
 * typing: focus has left every text field.
 */

/** Input types that take no typing: a focus on one is not "typing". */
const NOT_TYPED = new Set([
    "button",
    "checkbox",
    "color",
    "file",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
]);

/** Whether the focused element is one someone types into. */
export function isTypingIn(el: Element | null | undefined): boolean {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
        return !NOT_TYPED.has((el as HTMLInputElement).type);
    }
    return (el as HTMLElement).isContentEditable === true;
}

/**
 * Where the page was when the address moved, for the page Next mounts at the
 * new address (13 Nov 2026).
 *
 * Next 16 follows a `history.replaceState` (it must: DEV_LEARNINGS, "an
 * address written in place went back to the old one"), so `/new` →
 * `/<id>/edit` renders the edit route and the editor mounts again, scrolled
 * to the top. The record is saved by then (the address only moves after the
 * first save), so the page's place is all that is lost: where it was
 * scrolled and what had focus. The old page leaves it here and the new one
 * takes it on mount, within a few seconds and only at that address.
 */
export interface PagePlace {
    href: string;
    y: number;
    /** The focused control's id, when it has one. */
    focus: string | null;
    at: number;
}

const PLACE_KEY = "editor-shell:place";
const PLACE_FRESH_MS = 5000;

export function leavePlace(
    href: string,
    y: number,
    focus: string | null,
    store: Pick<Storage, "setItem"> | null = safeSession(),
    now = Date.now(),
): void {
    const place: PagePlace = { href, y, focus, at: now };
    try {
        store?.setItem(PLACE_KEY, JSON.stringify(place));
    } catch {
        // Storage full or blocked: the page simply starts at the top.
    }
}

/**
 * Whether a place was left for this address, without taking it: read while
 * the editor mounted there first renders, so it knows from that render that
 * it carries on a record just made rather than opening one again.
 */
export function placeWaiting(
    href: string,
    store: Pick<Storage, "getItem"> | null = safeSession(),
    now = Date.now(),
): boolean {
    try {
        const raw = store?.getItem(PLACE_KEY);
        if (!raw) return false;
        const place = JSON.parse(raw) as PagePlace;
        return place.href === href && now - place.at <= PLACE_FRESH_MS;
    } catch {
        return false;
    }
}

/** The place left for this address, once; null when none or stale. */
export function takePlace(
    href: string,
    store: Pick<Storage, "getItem" | "removeItem"> | null = safeSession(),
    now = Date.now(),
): PagePlace | null {
    try {
        const raw = store?.getItem(PLACE_KEY);
        if (!raw) return null;
        store?.removeItem(PLACE_KEY);
        const place = JSON.parse(raw) as PagePlace;
        if (place.href !== href || now - place.at > PLACE_FRESH_MS) return null;
        return place;
    } catch {
        return null;
    }
}

function safeSession(): Storage | null {
    try {
        return typeof window === "undefined" ? null : window.sessionStorage;
    } catch {
        return null;
    }
}
