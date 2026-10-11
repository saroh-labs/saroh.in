"use client";

import { useState } from "react";

/*
 * What Website › Settings' Edit sheets share besides their frame: the two
 * lines of type under a field, and which opening a row's sheet is on. The
 * frame itself is the app's one `FormSheet`
 * (`components/shared/form-sheet.tsx`), which says how a sheet
 * saves and closes.
 */

/** A problem said under the field it is about. */
export const PROBLEM =
    "text-pretty text-[12.5px] font-medium leading-[1.5] text-destructive-subtle-foreground";

/** A note under a field. */
export const NOTE = "text-pretty text-xs text-muted-foreground";

/**
 * One row's sheet: whether it is open, which opening this is (a `key`, so
 * each opening is a fresh draft; 0 until the first), and how to open and
 * close it.
 */
export interface SheetControl {
    open: boolean;
    opened: number;
    show: () => void;
    close: () => void;
}

/** A sheet nothing outside its row opens, such as a verification code's. */
export function useSheetControl(): SheetControl {
    const [state, setState] = useState({ open: false, opened: 0 });
    return {
        ...state,
        show: () => setState((s) => ({ open: true, opened: s.opened + 1 })),
        close: () => setState((s) => ({ ...s, open: false })),
    };
}
