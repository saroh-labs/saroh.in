"use client";

import { ErrorPage } from "@saroh/ui/error-page";
import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

/**
 * The templates site's error page, under the layout's header, as its 404 is.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, {
            boundary: "templates/root",
            digest: error.digest,
        });
    }, [error]);

    return (
        <main>
            <ErrorPage
                onRetry={retry}
                home={{ href: "/", label: "See the templates" }}
                digest={error.digest}
            />
        </main>
    );
}
