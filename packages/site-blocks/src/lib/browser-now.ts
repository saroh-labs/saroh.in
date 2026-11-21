"use client";

import { useSyncExternalStore } from "react";

/**
 * The browser's clock, to the minute, for a "today" fact (R18: Open now,
 * Today, the now line, Done). Null on the server, so a cached page never
 * carries one, unless `pinned` (fixtures, tests). One value for a whole
 * minute, so it is a stable snapshot; read again every 15 seconds.
 */
const noSubscribe = () => () => undefined;

function subscribeMinute(onChange: () => void): () => void {
    const timer = setInterval(onChange, 15_000);
    return () => clearInterval(timer);
}

export function useBrowserNow(pinned?: Date): number | null {
    return useSyncExternalStore(
        pinned ? noSubscribe : subscribeMinute,
        () => pinned?.getTime() ?? Math.floor(Date.now() / 60_000) * 60_000,
        () => pinned?.getTime() ?? null,
    );
}
