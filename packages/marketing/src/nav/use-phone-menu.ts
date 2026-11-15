"use client";

import { useEffect, useState } from "react";

/**
 * A phone menu's open state: closed on a new page, and when the window
 * widens past the phone nav (1240px, `MarketingNav`'s breakpoint).
 */
export function usePhoneMenu(pathname: string) {
    const [open, setOpen] = useState(false);

    // Adjusted while rendering, not in an effect.
    const [shownFor, setShownFor] = useState(pathname);
    if (shownFor !== pathname) {
        setShownFor(pathname);
        setOpen(false);
    }
    useEffect(() => {
        if (!open) return;
        const wide = window.matchMedia("(min-width: 1240px)");
        const onChange = () => wide.matches && setOpen(false);
        wide.addEventListener("change", onChange);
        return () => wide.removeEventListener("change", onChange);
    }, [open]);

    return [open, setOpen] as const;
}
