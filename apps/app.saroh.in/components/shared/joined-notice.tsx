"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
    cookieValue,
    decodeJoined,
    JOINED_COOKIE,
} from "@/lib/organizations/joined";

/** The line, held outside React's state: it arrives after the page draws. */
function lineStore() {
    let line: string | null = null;
    const listeners = new Set<() => void>();
    return {
        get: () => line,
        set: (next: string | null) => {
            if (next === line) return;
            line = next;
            listeners.forEach((listener) => listener());
        },
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

/**
 * The one-time line a new team member is met with (UX audit, 10 Oct):
 * "You've joined Rye & Co. as Reviewer. You can read and comment on the
 * pages you were asked to look at."
 *
 * The door an accepted invitation comes through leaves it in a cookie
 * (`app/open/[organizationId]/route.ts`). This reads it once the page is
 * up, shows it above the page, and takes the cookie away, so a reload or
 * the next page doesn't say it again. It stays until it is dismissed: two
 * sentences about what a role opens are not a toast's worth of reading.
 */
export function JoinedNotice() {
    const [store] = useState(lineStore);
    const line = useSyncExternalStore(store.subscribe, store.get, () => null);

    useEffect(() => {
        const found = decodeJoined(cookieValue(document.cookie, JOINED_COOKIE));
        // Taken away whatever it held, so it is said once or not at all.
        document.cookie = `${JOINED_COOKIE}=; Max-Age=0; path=/`;
        if (found) store.set(found);
    }, [store]);

    if (!line) return null;
    return (
        <Notice
            tone="success"
            data-joined-notice=""
            layout="banner"
            action={
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => store.set(null)}
                >
                    Got it
                </Button>
            }
        >
            {line}
        </Notice>
    );
}
