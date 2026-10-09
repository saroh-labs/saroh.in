"use client";

import { CrashDocument } from "@saroh/ui/crash-page";
import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

/**
 * The renderer's last boundary: the root layout itself threw, so Next renders
 * this in place of the whole document, with no stylesheet, font or
 * `SiteTheme`. On a merchant's domain it must not show Saroh's brand, and the
 * site's palette is unknown, so it is `CrashDocument`'s neutral page: the
 * same words as `SiteError` on SiteTheme's stone defaults, no mark, no home
 * link (the home page goes through the same layout).
 */
export default function GlobalError({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, { boundary: "sites/global", digest: error.digest });
    }, [error]);

    return (
        <CrashDocument brand="neutral" onRetry={retry} digest={error.digest} />
    );
}
