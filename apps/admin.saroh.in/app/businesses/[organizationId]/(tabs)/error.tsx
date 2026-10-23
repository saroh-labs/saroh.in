"use client";

import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

import { FailedPanel } from "@/components/states/failed-panel";

/**
 * A tab whose read failed (the API down or restarting): the failed panel
 * inside the tab, so the header and the other tabs stand, and Try again
 * reads it again.
 */
export default function TabError({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, {
            boundary: "admin/business-tab",
            digest: error.digest,
        });
    }, [error]);
    return (
        <FailedPanel
            things="this tab"
            reassurance="The rest of the page is current."
            onRetry={retry}
            reference={error.digest ?? null}
        />
    );
}
