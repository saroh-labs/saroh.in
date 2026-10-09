"use client";

import { SiteTheme } from "@saroh/site-blocks";
import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

import { SiteError } from "@/components/site-error";

/**
 * Root error boundary for the renderer.
 *
 * This one catches what `[domain]/error.tsx` cannot: a throw inside
 * `[domain]/layout.tsx` itself — the publication fetch failing — belongs to
 * the parent segment, which is here. That is also the case where the
 * merchant's palette does not exist yet, because `SiteTheme` is mounted by the
 * very layout that failed.
 *
 * So it mounts `SiteTheme` with no variables, which emits the neutral stone
 * defaults. That is the honest ground for this page: a visitor who typed a
 * merchant's domain must never be shown Saroh's brand — they did not come to
 * Saroh and have no reason to learn it exists — and guessing at a palette we
 * could not load would be worse than not having one. No "Back to home": the
 * home page goes through the same layout that just failed.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, { boundary: "sites/root", digest: error.digest });
    }, [error]);

    return (
        <>
            <SiteTheme />
            <SiteError
                onRetry={retry}
                home={false}
                ground
                digest={error.digest}
            />
        </>
    );
}
