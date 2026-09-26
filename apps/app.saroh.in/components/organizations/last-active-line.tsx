"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useSyncExternalStore } from "react";

import { lastActive } from "@/lib/organizations/last-active";

/**
 * The "Active 3 days ago" line under a person on Team → People, drawn in
 * the browser only.
 *
 * {@link lastActive} counts calendar days in the zone it runs in. The
 * server runs in UTC and the merchant need not, so for part of each day
 * the two would say "yesterday" and "today" and React would throw the
 * tree away on the mismatch. The server draws nothing — the snapshot both
 * sides agree on — and the browser fills the line in once it knows its own
 * zone, as `ViewerDate` does for a date.
 */
export function LastActiveLine({ at }: { at: string | null | undefined }) {
    const inBrowser = useSyncExternalStore(subscribe, onClient, onServer);
    const seen = inBrowser ? lastActive(at) : null;
    if (!seen) return null;
    return (
        <p
            className={cn(
                "mt-px text-[11.5px]",
                seen.stale
                    ? "text-brand-subtle-foreground"
                    : "text-muted-foreground",
            )}
        >
            {seen.text}
        </p>
    );
}

/** Nothing changes within a page's life, so there is nothing to subscribe to. */
const noop = () => undefined;
const subscribe = () => noop;
const onClient = () => true;
const onServer = () => false;
