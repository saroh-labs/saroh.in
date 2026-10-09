"use client";

import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

import { SiteError } from "@/components/site-error";

/**
 * Segment error boundary for a draft preview, rendered inside the preview's
 * layout — so `SiteTheme` is mounted and the merchant's palette is in scope.
 * No "Back to home": a preview link's home is the preview itself, which is
 * what Try again reloads.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, { boundary: "sites/preview", digest: error.digest });
    }, [error]);

    return <SiteError onRetry={retry} home={false} digest={error.digest} />;
}
