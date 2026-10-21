"use client";

import { lookOf } from "@saroh/site-blocks";
import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect, useSyncExternalStore } from "react";

import { SiteError } from "@/components/site-error";

/**
 * Segment error boundary, rendered inside the layout — so `SiteTheme` is
 * already mounted and the merchant's own palette, header and footer are in
 * scope, as for the sibling 404. Styled from the `--site-*` layer, never
 * Saroh's brand: this is still the merchant's website.
 */
const noSubscribe = () => () => undefined;

/**
 * The site's look, read from the mark the layout put on the page
 * (`data-site-look`, DEC-172): a boundary is handed no props of the
 * layout's. Nothing on the server, so the first frame is Classic's words,
 * and the look's follows at once.
 */
function usePageLook() {
    return useSyncExternalStore(
        noSubscribe,
        () =>
            lookOf(
                document
                    .querySelector("[data-site-look]")
                    ?.getAttribute("data-site-look"),
            ),
        () => undefined,
    );
}

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

    const look = usePageLook();

    return <SiteError onRetry={retry} digest={error.digest} look={look} />;
}
