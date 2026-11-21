"use client";

import { ErrorPage } from "@saroh/ui/error-page";
import { reportError } from "@saroh/ui/lib/report-error";
import { Wordmark } from "@saroh/ui/wordmark";
import { useEffect } from "react";

/**
 * App-root error boundary. The control plane reads everything through
 * api.saroh.in, so an api that is down or restarting is the most likely thing
 * to land here — and it must land as a retry, not as a sign-out or Next's
 * default unstyled screen. See lib/session.ts. It renders inside the root
 * layout, so staff keep the console's frame around it and only the screen
 * is replaced; without the frame (not staff, or the API unwell) the
 * wordmark says where they are.
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
        <main className="flex min-h-[70vh] items-center justify-center">
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
