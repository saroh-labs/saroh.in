"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type { PlaceSheet } from "@/lib/stores/place-rows";
import { PLACE_EDIT_PARAM, placeSheetFromParam } from "@/lib/stores/place-rows";

/**
 * Which of The place's Edit sheets is open. Held by the location's page
 * rather than the tab, so the readiness card ("Add address", "Set hours")
 * and Delivery ("Add an address") can open one from outside it.
 *
 * `opened` counts the openings, so each one is a fresh draft; the sheet is
 * kept while it slides shut. A link opens one with `?edit=` (the old
 * details page's address lands that way); closing it takes the query out
 * of the address, so a reload starts from the rows.
 */
export interface PlaceSheets {
    editing: { which: PlaceSheet; open: boolean; opened: number } | null;
    open: (which: PlaceSheet) => void;
    /**
     * Opens the sheet that follows another's save, unasked: the page it
     * was opened from hasn't drawn what was just saved yet.
     */
    next: (which: PlaceSheet) => void;
    close: () => void;
}

export function usePlaceSheets(
    /**
     * The sheet a request really opens: itself, another that has to come
     * first (the address of a place nobody visits yet asks whether they
     * do), or none for someone who can't edit.
     */
    resolve: (which: PlaceSheet) => PlaceSheet | null,
    /** Whether The place is the tab this page opened on. */
    onPlace: boolean,
): PlaceSheets {
    const asked = placeSheetFromParam(useSearchParams().get(PLACE_EDIT_PARAM));
    const [editing, setEditing] = useState<PlaceSheets["editing"]>(() => {
        const which = asked && onPlace ? resolve(asked) : null;
        return which ? { which, open: true, opened: 1 } : null;
    });

    const show = (which: PlaceSheet) =>
        setEditing((e) => ({
            which,
            open: true,
            opened: (e?.opened ?? 0) + 1,
        }));

    return {
        editing,
        open: (asking) => {
            const which = resolve(asking);
            if (which) show(which);
        },
        next: show,
        close: () => {
            setEditing((e) => (e ? { ...e, open: false } : e));
            const url = new URL(window.location.href);
            if (!url.searchParams.has(PLACE_EDIT_PARAM)) return;
            url.searchParams.delete(PLACE_EDIT_PARAM);
            window.history.replaceState(null, "", url);
        },
    };
}
