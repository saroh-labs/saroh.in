"use client";

import { useEffect, useState } from "react";

/** How long a wait for times goes unremarked. */
export const STILL_FINDING_AFTER_MS = 4_000;

/**
 * Said while the times are read, once the wait is long enough to notice, so a
 * slow answer doesn't look like a page that has stopped. Mounted with the
 * loading shapes, so each new read starts its own wait.
 */
export function StillFinding() {
    const [long, setLong] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setLong(true), STILL_FINDING_AFTER_MS);
        return () => clearTimeout(timer);
    }, []);
    return long ? (
        <p data-still-finding="" className="text-site-body text-sm">
            Still finding times…
        </p>
    ) : null;
}
