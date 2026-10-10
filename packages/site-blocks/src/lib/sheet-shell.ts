"use client";

import { useEffect } from "react";

/**
 * What every sheet on a merchant's site shares (the bag, paying, signing
 * in, the account's sheets), so each behaves the same under a thumb.
 */

/**
 * How tall a sheet may grow: 88% of the screen as the browser draws it now.
 * `dvh` follows a phone's address bar as it shows and hides; `vh` is the
 * tallest the screen ever gets, which put a sheet's last button under the
 * bar. Browsers without `dvh` keep `vh`. `overscroll-contain` stops a
 * scroll that reaches the sheet's end from moving the page behind it.
 */
export const SHEET_HEIGHT =
    "max-h-[88vh] supports-[height:100dvh]:max-h-[88dvh] overscroll-contain";

/** A sheet's round close button: 34px under a mouse, 44px under a finger. */
export const SHEET_CLOSE_SIZE = "coarse:size-11 size-[34px]";

let locks = 0;
let before = "";

/**
 * Hold the page still while a sheet is open: the page behind a sheet must
 * not scroll under the finger that is scrolling the sheet. Counted, so one
 * sheet opening over another (the bag, then signing in) lets go only when
 * the last has closed.
 */
export function useScrollLock(active = true): void {
    useEffect(() => {
        if (!active) return;
        if (locks === 0) {
            before = document.body.style.overflow;
            document.body.style.overflow = "hidden";
        }
        locks += 1;
        return () => {
            locks -= 1;
            if (locks === 0) document.body.style.overflow = before;
        };
    }, [active]);
}
