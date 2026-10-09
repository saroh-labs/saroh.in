"use client";

import { CrashPage } from "@saroh/ui/crash-page";
import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

/**
 * A docs page that failed, inside Nextra's navbar and footer. This app has no
 * Tailwind build for `@saroh/ui`, so it draws the self-styled `CrashPage`
 * (the same shape as every other error page) inline, under the navbar's own
 * wordmark.
 */
export default function Error({ error, retry }) {
    useEffect(() => {
        reportError(error, { boundary: "docs/root", digest: error.digest });
    }, [error]);

    return (
        <CrashPage
            inline
            onRetry={retry}
            homeHref="/"
            homeLabel="Back to the docs"
            digest={error.digest}
        />
    );
}
