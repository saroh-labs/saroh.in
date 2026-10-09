"use client";

import { CrashDocument } from "@saroh/ui/crash-page";
import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

/**
 * The last boundary in saroh.in: the root layout itself threw, so Next renders
 * this in place of the whole document, with none of the layout's CSS or
 * fonts. `CrashDocument` carries its own small stylesheet and keeps the shape
 * of every other error page (`@saroh/ui/error-page`). Nothing about the error
 * is shown, only Next's digest as a reference.
 */
export default function GlobalError({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, { boundary: "web/global", digest: error.digest });
    }, [error]);

    return (
        <CrashDocument
            onRetry={retry}
            homeHref="/"
            homeLabel="Go to the home page"
            digest={error.digest}
        />
    );
}
