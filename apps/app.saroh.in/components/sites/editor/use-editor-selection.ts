import { useMemo, useSyncExternalStore } from "react";

import {
    getPlace,
    placeOnServer,
    setPlace,
    subscribe,
} from "@/lib/sites/editor-prefs";
import type { Section } from "@/lib/sites/service";

export type EditorRailTab = "sections" | "style";
export type EditorInspectorTab = "block" | "feedback";
export type FixedPart = "header" | "footer";

/**
 * Where the merchant is in the editor: the selected block (or the header or
 * footer), the rail's tab and the inspector's tab. Moved out of
 * `site-editor.tsx` unchanged (#260).
 *
 * The place comes from the preferences store rather than component state: it
 * belongs to the browser, outlives this mount, and the server has no business
 * guessing it. `useSyncExternalStore` renders the server snapshot (the
 * defaults) during hydration and swaps to the stored values before paint, so
 * the markup matches what was sent.
 */
export function useEditorSelection({
    siteId,
    sectionCount,
}: {
    siteId: string;
    /**
     * The page's section count on load. It is what makes a remembered index
     * meaningful, so it is bound into both snapshots rather than read inside
     * the store.
     */
    sectionCount: number;
}) {
    // Held stable because useSyncExternalStore compares snapshots by identity.
    const serverPlace = useMemo(
        () => placeOnServer(sectionCount),
        [sectionCount],
    );
    const place = useSyncExternalStore(
        subscribe,
        () => getPlace(siteId, sectionCount),
        () => serverPlace,
    );
    const { selectedIndex, rail, inspector } = place;

    /*
     * The header or footer, when one of those is selected instead of a block
     * (#336). Remembered with the place, so a reload comes back to it.
     */
    const selectedChrome = place.chrome;
    // Writing through the store is what makes the choice survive a reload;
    // the re-render is the store's notification, not a second source of truth.
    const setSelectedIndex = (next: number | null) =>
        setPlace(siteId, sectionCount, { selectedIndex: next, chrome: null });
    const selectChrome = (part: FixedPart) => {
        setPlace(siteId, sectionCount, { selectedIndex: null, chrome: part });
        setInspector("block");
    };
    const setRail = (next: EditorRailTab) =>
        setPlace(siteId, sectionCount, { rail: next });
    const setInspector = (next: EditorInspectorTab) =>
        setPlace(siteId, sectionCount, { inspector: next });
    /** The selection as of now, ahead of React's next render. */
    const selectedIndexNow = () => getPlace(siteId, sectionCount).selectedIndex;

    return {
        place,
        selectedIndex,
        selectedChrome,
        rail,
        inspector,
        setSelectedIndex,
        selectChrome,
        setRail,
        setInspector,
        selectedIndexNow,
    };
}

export type EditorSelection = ReturnType<typeof useEditorSelection>;

/** The selected section and its index, together. */
export interface ActiveSection {
    index: number;
    section: Section;
}

/*
 * The selected section AND its index together, so nothing downstream has to
 * assert that the index is still valid. Removing a section can leave the
 * index past the end, and carrying the pair makes that a single check here
 * rather than a non-null assertion at every use.
 */
export function activeSection(
    selectedIndex: number | null,
    sections: Section[],
): ActiveSection | null {
    return selectedIndex !== null && selectedIndex < sections.length
        ? { index: selectedIndex, section: sections[selectedIndex] }
        : null;
}
