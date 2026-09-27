import { useState, useSyncExternalStore } from "react";

import type { EditorSelection } from "@/components/sites/editor/use-editor-selection";

/**
 * How the editor lays itself out for the window it is in (G4):
 *
 * - `wide`: the three columns — blocks, the page, the inspector (#340).
 * - `narrow`, 1,200px and below: the inspector leaves its column and opens
 *   over the page as a sheet when a block is chosen. Three columns cannot all
 *   hold their width here: at 924px the canvas was left with 344px, so the
 *   Desktop frame drew narrower than the Phone one (Saroh Site Editor.dc.html).
 * - `phone`, below 760px, where the workspace's tab bar starts too: the page
 *   fills the screen, the rail's tabs sit in a bar at the foot, and the top
 *   bar folds Publish, the status and the view into one menu.
 */
export type EditorLayout = "wide" | "narrow" | "phone";

export const NARROW_QUERY = "(max-width: 1200px)";
export const PHONE_QUERY = "(max-width: 759.98px)";

function matches(query: string): boolean {
    // No `matchMedia` (an old browser, a test without one) reads as wide.
    return typeof window.matchMedia === "function"
        ? window.matchMedia(query).matches
        : false;
}

function subscribe(onChange: () => void): () => void {
    if (typeof window.matchMedia !== "function") return () => undefined;
    const lists = [NARROW_QUERY, PHONE_QUERY].map((q) => window.matchMedia(q));
    for (const list of lists) list.addEventListener("change", onChange);
    return () => {
        for (const list of lists) list.removeEventListener("change", onChange);
    };
}

function layoutNow(): EditorLayout {
    if (matches(PHONE_QUERY)) return "phone";
    return matches(NARROW_QUERY) ? "narrow" : "wide";
}

/**
 * The layout for the window as it is now. The server draws `wide` and the
 * client swaps before paint, as the panel widths do (`editor-prefs`).
 */
export function useEditorLayout(): EditorLayout {
    return useSyncExternalStore(subscribe, layoutNow, () => "wide");
}

/** Which overlay is open over the page when the layout is not wide. */
export type EditorSheet = "inspector" | "rail" | null;

/**
 * The inspector and rail sheets (G4), and the selection that opens them.
 *
 * Choosing something — a block on the page or in the list, the header or
 * footer, a note's pin, a new block, a jump from a flag — opens the
 * inspector, so the selection's setters are wrapped here and handed on in
 * their place. Clearing the selection from the Block tab (a remove) closes it:
 * a sheet about nothing is in the way. The selection itself is kept when the
 * sheet closes, so turning a phone on its side keeps what was chosen.
 *
 * Nothing opens on its own: a selection remembered from last time stays on
 * the page, outlined, until the merchant chooses again.
 */
export function useEditorSheets(
    selection: EditorSelection,
    layout: EditorLayout,
    /** Preview (G5) has no editing tools, so it puts any sheet away. */
    previewing: boolean,
) {
    const [sheet, setSheet] = useState<EditorSheet>(null);

    /*
     * Crossing a breakpoint: wide has no sheets, and the rail's sheet only
     * exists on a phone. The inspector's stays open across narrow and phone,
     * so rotating mid-edit keeps the fields in hand. Adjusted while rendering,
     * from what the last render saw, rather than in an effect.
     */
    const [seen, setSeen] = useState({ layout, previewing });
    if (seen.layout !== layout || seen.previewing !== previewing) {
        setSeen({ layout, previewing });
        if (
            previewing ||
            layout === "wide" ||
            (sheet === "rail" && layout !== "phone")
        ) {
            setSheet(null);
        }
    }

    const showInspector = () => setSheet("inspector");
    const wrapped: EditorSelection = {
        ...selection,
        setSelectedIndex(next) {
            selection.setSelectedIndex(next);
            if (next !== null) showInspector();
            else if (selection.inspector === "block") setSheet(null);
        },
        selectChrome(part) {
            selection.selectChrome(part);
            showInspector();
        },
        setInspector(next) {
            selection.setInspector(next);
            showInspector();
        },
    };

    return {
        selection: wrapped,
        /** The open sheet; always null when the layout is wide. */
        sheet: layout === "wide" ? null : sheet,
        setSheet,
    };
}

export type EditorSheets = ReturnType<typeof useEditorSheets>;
