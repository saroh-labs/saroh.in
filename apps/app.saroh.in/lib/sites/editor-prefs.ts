/**
 * What the editor remembers between visits.
 *
 * The spec asks the editor to come back the way the merchant left it: panel
 * widths, which tab was open, which section was selected, which device the
 * preview was showing. None of it is worth a database round trip — it is
 * per-person, per-browser chrome, and a merchant who resizes a panel on their
 * laptop has said nothing about what their phone should do.
 *
 * Two scopes, deliberately:
 *
 *   - CHROME (panel widths, device) is about how this person likes to work and
 *     is the same whichever site they open.
 *   - PLACE (selected section, open tab) belongs to one site — coming back to
 *     section 4 of a different site would be nonsense.
 *
 * Every read is defensive. `localStorage` throws outright in some privacy
 * modes, returns null when cleared, and holds whatever a previous version of
 * this code wrote — so a bad value must degrade to the default rather than
 * take the editor down with it.
 */

/** Rail width bounds, in px. From the design spec's §7 measurements. */
export const RAIL_MIN = 200;
export const RAIL_MAX = 300;
export const RAIL_DEFAULT = 200;

/** Field-panel width bounds, in px. Also §7. */
export const PANEL_MIN = 240;
export const PANEL_MAX = 400;
export const PANEL_DEFAULT = 240;

const CHROME_KEY = "saroh.editor.chrome";
const siteKey = (siteId: string) => `saroh.editor.site.${siteId}`;

export interface EditorChrome {
    railWidth: number;
    panelWidth: number;
    device: "desktop" | "tablet" | "phone";
}

export interface EditorPlace {
    selectedIndex: number | null;
    rail: "sections" | "pages" | "review" | "style";
    /** Where the preview was scrolled to. In the spec's persisted list. */
    scrollTop: number;
}

export const CHROME_DEFAULT: EditorChrome = {
    railWidth: RAIL_DEFAULT,
    panelWidth: PANEL_DEFAULT,
    device: "desktop",
};

/** Clamp to the design's bounds. A stored width outside them is not honoured. */
export function clampRail(px: number): number {
    return clamp(px, RAIL_MIN, RAIL_MAX, RAIL_DEFAULT);
}

export function clampPanel(px: number): number {
    return clamp(px, PANEL_MIN, PANEL_MAX, PANEL_DEFAULT);
}

function clamp(px: number, min: number, max: number, fallback: number): number {
    // NaN and Infinity both land here: a non-finite width would collapse the
    // grid track to nothing, which is worse than ignoring the stored value.
    if (!Number.isFinite(px)) return fallback;
    return Math.min(max, Math.max(min, Math.round(px)));
}

function read(key: string): unknown {
    try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? null : (JSON.parse(raw) as unknown);
    } catch {
        // Unavailable storage, or JSON this version cannot parse. Either way
        // the caller wants a default, not an exception.
        return null;
    }
}

function write(key: string, value: unknown): void {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Full or blocked storage. Losing a panel width is not worth surfacing.
    }
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------
//
// `localStorage` is an external system, so this is a `useSyncExternalStore`
// store rather than state seeded by an effect. That is not a formality: React
// renders the SERVER snapshot during hydration and swaps to the client one
// before paint, which is exactly the behaviour we want — markup that matches
// what the server sent, and no visible jump from the default width to the
// remembered one.
//
// Snapshots are CACHED because `useSyncExternalStore` compares them by
// identity. Parsing storage afresh on every call would return a new object
// every time and loop forever.

type Listener = () => void;
const listeners = new Set<Listener>();
const cache = new Map<string, unknown>();

function notify(): void {
    listeners.forEach((l) => l());
}

export function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function parseChrome(v: unknown): EditorChrome {
    if (typeof v !== "object" || v === null) return CHROME_DEFAULT;
    const o = v as Partial<Record<keyof EditorChrome, unknown>>;
    return {
        railWidth: clampRail(
            typeof o.railWidth === "number" ? o.railWidth : RAIL_DEFAULT,
        ),
        panelWidth: clampPanel(
            typeof o.panelWidth === "number" ? o.panelWidth : PANEL_DEFAULT,
        ),
        // An unknown device string must not reach the preview, which switches
        // on exactly these three.
        device:
            o.device === "tablet" || o.device === "phone"
                ? o.device
                : "desktop",
    };
}

/** The chrome as the browser has it. Stable identity until it is written. */
export function getChrome(): EditorChrome {
    const hit = cache.get(CHROME_KEY);
    if (hit !== undefined) return hit as EditorChrome;
    const value = parseChrome(read(CHROME_KEY));
    cache.set(CHROME_KEY, value);
    return value;
}

/** What the server renders: the defaults, every time and for everyone. */
export function getChromeOnServer(): EditorChrome {
    return CHROME_DEFAULT;
}

/**
 * Patch the chrome. A PARTIAL merged against the value in the cache, not a
 * whole object built by the caller — a caller can only spread the snapshot its
 * render captured, so two updates in one tick would each overwrite the other
 * and the second would silently win. Merging here means the store is the one
 * that decides what "current" is.
 */
export function setChrome(patch: Partial<EditorChrome>): void {
    const current = getChrome();
    const merged = { ...current, ...patch };
    const value: EditorChrome = {
        railWidth: clampRail(merged.railWidth),
        panelWidth: clampPanel(merged.panelWidth),
        device: merged.device,
    };
    cache.set(CHROME_KEY, value);
    write(CHROME_KEY, value);
    notify();
}

/**
 * Where the merchant was in one site. `sectionCount` is required because a
 * remembered index only means something against the list it was taken from:
 * sections get deleted between visits, and selecting index 7 of a 3-section
 * page would blank the field panel with no way to tell why.
 */
export function getPlace(siteId: string, sectionCount: number): EditorPlace {
    const key = siteKey(siteId);
    const hit = cache.get(key);
    if (hit !== undefined) return hit as EditorPlace;

    const fallback: EditorPlace = {
        selectedIndex: sectionCount > 0 ? 0 : null,
        rail: "sections",
        scrollTop: 0,
    };
    const v = read(key);
    let value = fallback;
    if (typeof v === "object" && v !== null) {
        const o = v as Partial<Record<keyof EditorPlace, unknown>>;
        const i = o.selectedIndex;
        value = {
            selectedIndex:
                typeof i === "number" &&
                Number.isInteger(i) &&
                i >= 0 &&
                i < sectionCount
                    ? i
                    : fallback.selectedIndex,
            rail:
                o.rail === "style" || o.rail === "pages" || o.rail === "review"
                    ? o.rail
                    : "sections",
            // A negative or non-finite offset would scroll nowhere useful.
            scrollTop:
                typeof o.scrollTop === "number" &&
                Number.isFinite(o.scrollTop) &&
                o.scrollTop >= 0
                    ? o.scrollTop
                    : 0,
        };
    }
    cache.set(key, value);
    return value;
}

/**
 * What the server renders for a site. Deliberately NOT the cached client
 * snapshot: this module's cache is module-level, so on the server it would be
 * shared by every request in the process and one visitor's selected section
 * would be served to the next. The server knows only the section count, which
 * is the same fact for everyone.
 *
 * The caller must hold this object stable across renders (a `useMemo` on
 * `sectionCount`), because `useSyncExternalStore` compares snapshots by
 * identity.
 */
export function placeOnServer(sectionCount: number): EditorPlace {
    return {
        selectedIndex: sectionCount > 0 ? 0 : null,
        rail: "sections",
        scrollTop: 0,
    };
}

/** Patch a site's place. Merged against the cache, for the same reason. */
export function setPlace(
    siteId: string,
    sectionCount: number,
    patch: Partial<EditorPlace>,
): void {
    const key = siteKey(siteId);
    const value = { ...getPlace(siteId, sectionCount), ...patch };
    cache.set(key, value);
    write(key, value);
    notify();
}
