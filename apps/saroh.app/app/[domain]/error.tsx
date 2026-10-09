"use client";

import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

import { SiteError } from "@/components/site-error";

/**
 * Segment error boundary, rendered inside the layout — so `SiteTheme` is
 * already mounted and the merchant's own palette, header and footer are in
 * scope, as for the sibling 404. Styled from the `--site-*` layer, never
 * Saroh's brand: this is still the merchant's website.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, { boundary: "sites/domain", digest: error.digest });
    }, [error]);

    return <SiteError onRetry={retry} digest={error.digest} />;
}
