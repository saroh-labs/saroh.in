"use client";

import { useMemo, useRef } from "react";

/**
 * Only the newest call's answer lands (review #12, 20 Oct 2026).
 *
 * A screen that reads again (Next, Back, untick, Next; a retry; a reopen)
 * can have two reads in flight, and the older one can answer last. Each
 * read takes `begin()` and, after every await, checks the `current()` it
 * was handed before it sets state. `drop()` makes whatever is in flight
 * stale without starting a new read: on close, on Back, on reopen.
 */
export interface LatestCall {
    /** Starts a call; the function says whether it is still the newest. */
    begin: () => () => boolean;
    /** Whatever is in flight answers to nobody. */
    drop: () => void;
}

export function useLatestCall(): LatestCall {
    const at = useRef(0);
    return useMemo(
        () => ({
            begin: () => {
                at.current += 1;
                const mine = at.current;
                return () => mine === at.current;
            },
            drop: () => {
                at.current += 1;
            },
        }),
        [],
    );
}
