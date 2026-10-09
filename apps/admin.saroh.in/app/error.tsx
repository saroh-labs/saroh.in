"use client";

import { ErrorPage } from "@saroh/ui/error-page";
import { reportError } from "@saroh/ui/lib/report-error";
import { Wordmark } from "@saroh/ui/wordmark";
import { useEffect } from "react";

/**
 * App-root error boundary. The control plane reads everything through
 * api.saroh.in, so an api that is down or restarting is the most likely thing
 * to land here — and it must land as a retry, not as a sign-out or Next's
 * default unstyled screen. See lib/session.ts. Drawn like the console's 404;
 * a client boundary can't ask who the staff member is, so it is the bare page
 * with the wordmark.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, { boundary: "admin/root", digest: error.digest });
    }, [error]);

    return (
        <main className="flex min-h-screen items-center justify-center bg-background">
            <ErrorPage
                mark={<Wordmark suffix="console" />}
                description="The console couldn’t load this page. It’s usually temporary, so try again in a moment."
                onRetry={retry}
                home={{ href: "/", label: "Back to the console" }}
                digest={error.digest}
            />
        </main>
    );
}
