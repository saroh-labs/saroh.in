"use client";

import type { RefObject } from "react";
import { useEffect } from "react";

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * While `active`, keeps Tab and Shift+Tab inside `ref`, closes on Escape,
 * stops the page behind from scrolling, and on deactivation returns focus to
 * whatever had it before (the button that opened the overlay). Used by the
 * lightbox and the phone menu sheet.
 */
export function useFocusTrap(
    ref: RefObject<HTMLElement | null>,
    active: boolean,
    onEscape: () => void,
    /** Where focus lands on open; defaults to the first focusable element. */
    initial?: RefObject<HTMLElement | null>,
) {
    useEffect(() => {
        if (!active) return;
        const root = ref.current;
        if (!root) return;
        const opener =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        const items = () =>
            Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
        const all = items();
        (initial?.current ?? (all.length > 0 ? all[0] : root)).focus();

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onEscape();
                return;
            }
            if (e.key !== "Tab") return;
            const list = items();
            if (list.length === 0) {
                e.preventDefault();
                return;
            }
            const first = list[0];
            const last = list[list.length - 1];
            const at = document.activeElement;
            if (e.shiftKey && (at === first || !root.contains(at))) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && (at === last || !root.contains(at))) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = overflow;
            opener?.focus();
        };
        // `onEscape` is read fresh through the closure each time the overlay
        // opens; re-running on its identity would steal focus mid-dialog.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, ref, initial]);
}
