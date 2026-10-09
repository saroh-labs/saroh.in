"use client";

import { CrashDocument } from "@saroh/ui/crash-page";
import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

/**
 * The last boundary in the developer docs: the root layout itself threw, so Next renders
 * this in place of the whole document, with none of the layout's CSS or
 * fonts. `CrashDocument` carries its own small stylesheet and keeps the shape
 * of every other error page (`@saroh/ui/error-page`). Nothing about the error
 * is shown, only Next's digest as a reference.
 */
export default function GlobalError({ error, retry }) {
    useEffect(() => {
        reportError(error, { boundary: "docs/global", digest: error.digest });
    }, [error]);

    return (
        <CrashDocument
            onRetry={retry}
            homeHref="/"
            homeLabel="Back to the docs"
            digest={error.digest}
        />
    );
}
