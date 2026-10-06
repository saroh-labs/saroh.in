"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { DataViewMode } from "./types";

const STORAGE_PREFIX = "saroh-view-mode:";
/**
 * The design's table boundary (brand file §21): above it a table shows every
 * column, below it rows become cards. Collapsing the rail to 64px at 1100 is
 * what buys a table the width to reach down here.
 */
export const TABLE_MIN_WIDTH = 760;

/**
 * In-memory overrides, so a click updates every mounted view of the same id
 * without waiting for a storage event that same-tab writes never fire.
 */
const chosen = new Map<string, DataViewMode>();
const listeners = new Set<() => void>();

const WIDE_QUERY = `(min-width: ${TABLE_MIN_WIDTH}px)`;

/**
 * A resize counts as a change too: the viewport decides on a phone, so
 * crossing the table boundary has to re-read it. A tablet that rotates, or a
 * window dragged narrow, otherwise keeps a table it no longer has the width
 * for.
 */
function subscribe(onChange: () => void) {
    listeners.add(onChange);
    const mq =
        typeof window.matchMedia === "function"
            ? window.matchMedia(WIDE_QUERY)
            : null;
    mq?.addEventListener("change", onChange);
    return () => {
        listeners.delete(onChange);
        mq?.removeEventListener("change", onChange);
    };
}

/** What a phone shows: the list, whenever the view offers one. */
export function phoneModeFor(
    available: DataViewMode[],
    defaultMode: DataViewMode,
): DataViewMode {
    return available.includes("list") ? "list" : defaultMode;
}

/**
 * The density rules, as one pure function so they can be tested without a
 * browser (Phone Tables audit T8):
 *
 * 1. Below the table boundary the phone mode always wins. A choice saved on
 *    a desk ("table") must not follow the merchant onto a phone, where a
 *    table hides its right-hand columns behind a sideways scroll.
 * 2. At or above it, a saved choice wins. Someone who deliberately picked
 *    list on a desktop meant it, and having the layout argue back on every
 *    reload is the kind of small betrayal that makes software feel hostile.
 * 3. With no choice, the view's default.
 */
export function resolveViewMode({
    available,
    defaultMode,
    wide,
    saved,
}: {
    available: DataViewMode[];
    defaultMode: DataViewMode;
    wide: boolean;
    saved?: string | null;
}): DataViewMode {
    if (!wide) return phoneModeFor(available, defaultMode);
    if (saved && available.includes(saved as DataViewMode)) {
        return saved as DataViewMode;
    }
    return defaultMode;
}

function isWide(): boolean {
    // No matchMedia (a test's jsdom): treat it as a desk, the old default.
    if (typeof window.matchMedia !== "function") return true;
    return window.matchMedia(WIDE_QUERY).matches;
}

function readSaved(viewId: string): string | null {
    const override = chosen.get(viewId);
    if (override) return override;
    try {
        return window.localStorage.getItem(STORAGE_PREFIX + viewId);
    } catch {
        // Blocked storage: no preference. A missing preference is not worth
        // failing a render over.
        return null;
    }
}

/**
 * The client's answer, as one primitive so `useSyncExternalStore` can compare
 * snapshots: `"wide:table"`, `"narrow:list"`.
 */
function readSnapshot(
    viewId: string,
    available: DataViewMode[],
    defaultMode: DataViewMode,
): string {
    const wide = isWide();
    const mode = resolveViewMode({
        available,
        defaultMode,
        wide,
        saved: wide ? readSaved(viewId) : null,
    });
    return `${wide ? "wide" : "narrow"}:${mode}`;
}

/**
 * The merchant's chosen density for one view, remembered.
 *
 * The rules are `resolveViewMode`'s: a phone always gets the list, a desk
 * gets the saved choice or the view's default.
 *
 * ## No guess before hydration
 *
 * The server knows neither the viewport nor the saved choice, so it does not
 * pick: `mode` is null, and DataView draws the desk rendering and the phone
 * rendering side by side, each behind a `760px` media rule. The phone's first
 * paint is the list, with no table flashed before it (Phone Tables audit T8);
 * once hydrated, the rendering not in use is dropped.
 *
 * ## Why `useSyncExternalStore` and not the two obvious alternatives
 *
 * This is client-only state that must not disagree with the server's HTML, and
 * both simpler approaches fail on that:
 *
 * - **A lazy `useState` initialiser** (what this was) reads `localStorage` on
 *   the client's first render while the server rendered `defaultMode`. The
 *   moment a stored preference differed, React 19 failed hydration outright —
 *   "the server rendered HTML didn't match the client" — and discarded the tree
 *   to rebuild it. One saved render bought a full client regeneration.
 * - **Resolving in an effect** fixes hydration but is a `setState` in an effect,
 *   which is a cascading render and is what `react-hooks/set-state-in-effect`
 *   exists to stop.
 *
 * `useSyncExternalStore` is the API built for exactly this: `getServerSnapshot`
 * (null) supplies the value used for SSR *and* for the hydration render, so
 * both sides agree by construction, and React then re-reads the client snapshot as part of
 * its normal work rather than as a second render we scheduled ourselves.
 */
export function useViewMode(
    viewId: string,
    available: DataViewMode[],
    defaultMode: DataViewMode,
): {
    /** The mode to draw, or null while the server's HTML is being hydrated. */
    mode: DataViewMode | null;
    /** Whether the viewport is at the table boundary or wider (null: unknown). */
    wide: boolean | null;
    /** What the desk draws before anything is known: the view's default. */
    deskMode: DataViewMode;
    /** What a phone draws, always (`phoneModeFor`). */
    phoneMode: DataViewMode;
    choose: (next: DataViewMode) => void;
} {
    const snapshot = useSyncExternalStore(
        subscribe,
        () => readSnapshot(viewId, available, defaultMode),
        // The server has no storage and no viewport, so it does not guess:
        // `null` tells DataView to draw both the desk and the phone rendering
        // and let a CSS media rule show one. A guess here ("table") was the
        // phone's flash of table before hydration (T8).
        () => null,
    );

    const choose = useCallback(
        (next: DataViewMode) => {
            chosen.set(viewId, next);
            try {
                window.localStorage.setItem(STORAGE_PREFIX + viewId, next);
            } catch {
                // Session-only preference; still applied, just not remembered.
            }
            listeners.forEach((l) => l());
        },
        [viewId],
    );

    const [width, resolved] = snapshot
        ? (snapshot.split(":") as [string, DataViewMode])
        : [null, null];

    return {
        mode: resolved,
        wide: width === null ? null : width === "wide",
        deskMode: defaultMode,
        phoneMode: phoneModeFor(available, defaultMode),
        choose,
    };
}
