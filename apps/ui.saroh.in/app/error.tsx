"use client";

import { ErrorPage } from "@saroh/ui/error-page";
import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

/**
 * The UI catalogue's error page.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, { boundary: "ui/root", digest: error.digest });
    }, [error]);

    return (
        <main>
            <ErrorPage
                onRetry={retry}
                home={{ href: "/", label: "Back to the catalogue" }}
                digest={error.digest}
            />
        </main>
    );
}
