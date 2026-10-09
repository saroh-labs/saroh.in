"use client";

import { ErrorPage } from "@saroh/ui/error-page";
import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

/**
 * A V2 page that failed, drawn inside the `(v2)` layout's nav and footer
 * (`SiteChrome`), as the 404 is: the visitor keeps every way on the site
 * offers.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, { boundary: "web/v2", digest: error.digest });
    }, [error]);

    return (
        <ErrorPage
            onRetry={retry}
            home={{ href: "/", label: "Go to the home page" }}
            digest={error.digest}
        />
    );
}
