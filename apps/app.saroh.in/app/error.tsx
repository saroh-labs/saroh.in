"use client";

import { ErrorPage } from "@saroh/ui/error-page";
import { reportError } from "@saroh/ui/lib/report-error";
import { Wordmark } from "@saroh/ui/wordmark";
import { useEffect } from "react";

/**
 * App-root error boundary, outside the workspace shell. A thrown data fetch
 * (the API down or restarting) lands here with Try again instead of Next's
 * default unstyled screen — and, paired with services that THROW on real
 * failures (#101), a genuine outage no longer masquerades as an empty state.
 * Pages inside the shell have their own boundaries (`SectionError`), which
 * keep the rail; this one has no rail, so the wordmark says where you are.
 *
 * A read failed, so nothing the merchant had saved is touched: the sentence
 * says so. The digest is the reference support can look up.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, { boundary: "app/root", digest: error.digest });
    }, [error]);

    return (
        <main className="flex min-h-screen items-center justify-center bg-background">
            <ErrorPage
                mark={<Wordmark />}
                description="This page didn’t load. Anything you’d already saved is safe. It’s usually temporary, so try again."
                onRetry={retry}
                home={{ href: "/", label: "Back to Home" }}
                digest={error.digest}
            />
        </main>
    );
}
