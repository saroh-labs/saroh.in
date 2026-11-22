"use client";

import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

import { FailedPanel } from "./failed-panel";

/**
 * A region whose read failed (the API down or restarting), for a
 * segment's `error.tsx`: the failed panel in the region's place, so the
 * console frame and the header and tabs above it stand, and Try again
 * reads it again.
 */
export function RegionError({
    error,
    retry,
    boundary,
    things,
}: {
    error: Error & { digest?: string };
    retry: () => void;
    /** Where it was caught, for error tracking: "admin/billing". */
    boundary: string;
    /** "this tab". */
    things: string;
}) {
    useEffect(() => {
        reportError(error, { boundary, digest: error.digest });
    }, [error, boundary]);
    return (
        <FailedPanel
            things={things}
            reassurance="The rest of the page is current."
            onRetry={retry}
            reference={error.digest ?? null}
        />
    );
}
