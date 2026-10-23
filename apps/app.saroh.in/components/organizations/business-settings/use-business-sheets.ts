"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type { BusinessSheet } from "@/lib/organizations/business-rows";
import {
    BUSINESS_EDIT_PARAM,
    BUSINESS_SHEET_TAB,
    BUSINESS_TAB_PARAM,
    BUSINESS_TABS,
    businessEditId,
    businessSheetFromParam,
} from "@/lib/organizations/business-rows";

/**
 * Which of Settings › Business's Edit sheets is open, as a location's are
 * held (`use-place-sheets.ts`). One for the whole page, so only one sheet
 * is ever open.
 *
 * `opened` counts the openings, so each one is a fresh draft; the sheet is
 * kept while it slides shut. A link opens one with `?edit=` on the tab its
 * row is on, on arrival and from this page too (the checklist above the
 * tabs links here); closing it takes the query out of the address, so a
 * reload starts from the rows.
 */
export interface BusinessSheets {
    editing: {
        which: BusinessSheet;
        open: boolean;
        opened: number;
        /** The id of the Edit that takes the keyboard back. */
        returnTo: string;
    } | null;
    /** `from` is the Edit's id, where a sheet has more than one. */
    open: (which: BusinessSheet, from?: string) => void;
    close: () => void;
}

type Editing = NonNullable<BusinessSheets["editing"]>;

const opening = (
    which: BusinessSheet,
    before: Editing | null,
    from?: string,
): Editing => ({
    which,
    open: true,
    opened: (before?.opened ?? 0) + 1,
    returnTo: from ?? businessEditId(which),
});

export function useBusinessSheets(
    /**
     * The sheet a request really opens: itself, another that has to come
     * first, or none for someone who can't edit.
     */
    resolve: (which: BusinessSheet) => BusinessSheet | null,
    /** Before a row's Edit opens a sheet: the last save's Undo closes. */
    onOpen: () => void,
): BusinessSheets {
    const params = useSearchParams();
    const param = params.get(BUSINESS_EDIT_PARAM);
    /** The sheet the address asks for, when it is on the tab it names. */
    const asked = () => {
        const sheet = businessSheetFromParam(param);
        if (!sheet) return null;
        const tab =
            BUSINESS_TABS.find((t) => t === params.get(BUSINESS_TAB_PARAM)) ??
            BUSINESS_TABS[0];
        return BUSINESS_SHEET_TAB[sheet] === tab ? resolve(sheet) : null;
    };
    const [editing, setEditing] = useState<Editing | null>(() => {
        const which = asked();
        return which ? opening(which, null) : null;
    });
    // The address moved underneath (a step in the checklist above the
    // tabs): follow it, in render rather than an effect.
    const [seen, setSeen] = useState(param);
    if (param !== seen) {
        setSeen(param);
        const which = asked();
        if (which) setEditing(opening(which, editing));
    }

    return {
        editing,
        open: (asking, from) => {
            const which = resolve(asking);
            if (!which) return;
            onOpen();
            setEditing((e) =>
                opening(which, e, which === asking ? from : undefined),
            );
        },
        close: () => {
            setEditing((e) => (e ? { ...e, open: false } : e));
            const url = new URL(window.location.href);
            if (!url.searchParams.has(BUSINESS_EDIT_PARAM)) return;
            url.searchParams.delete(BUSINESS_EDIT_PARAM);
            window.history.replaceState(null, "", url);
        },
    };
}
