"use client";

import { useCallback, useEffect, useState } from "react";

/** How long a change the person asked for may take before the rows dim. */
export const DIM_AFTER_MS = 300;

/**
 * Whether the rows on screen should dim (finding 22): only while a page,
 * view or filter the person asked for is on its way, and only once it has
 * taken longer than {@link DIM_AFTER_MS}. A first load, a background
 * refresh or a change of address nobody asked for (`pending` with no
 * `ask()` before it) never greys the list: grey rows read as disabled.
 */
export function useAskedPending(pending: boolean): {
    dim: boolean;
    /** The person asked for another page, view or filter. */
    ask: () => void;
} {
    const [asked, setAsked] = useState(false);
    const [late, setLate] = useState(false);
    const waiting = asked && pending;

    // The ask is spent once its page has landed.
    const [wasPending, setWasPending] = useState(pending);
    if (pending !== wasPending) {
        setWasPending(pending);
        if (!pending) {
            setAsked(false);
            setLate(false);
        }
    }

    useEffect(() => {
        if (!waiting) return;
        const timer = setTimeout(() => setLate(true), DIM_AFTER_MS);
        return () => clearTimeout(timer);
    }, [waiting]);

    const ask = useCallback(() => setAsked(true), []);
    return { dim: waiting && late, ask };
}
