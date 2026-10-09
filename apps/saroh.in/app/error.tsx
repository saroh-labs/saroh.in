"use client";

import { ErrorPage } from "@saroh/ui/error-page";
import { reportError } from "@saroh/ui/lib/report-error";
import { Wordmark } from "@saroh/ui/wordmark";
import { useEffect } from "react";

/**
 * saroh.in's root error boundary, for the pages outside the V2 chrome (the
 * waitlist, the pricing draft) and anything the `(v2)` boundary can't catch.
 * The site is static, so this mostly meets a page whose script failed in the
 * browser. It has no chrome to sit in, so the wordmark says where you are.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, { boundary: "web/root", digest: error.digest });
    }, [error]);

    return (
        <main className="flex min-h-screen items-center justify-center bg-background">
            <ErrorPage
                mark={<Wordmark />}
                onRetry={retry}
                home={{ href: "/", label: "Go to the home page" }}
                digest={error.digest}
            />
        </main>
    );
}
