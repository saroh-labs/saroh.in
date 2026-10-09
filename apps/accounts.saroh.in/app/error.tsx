"use client";

import { ErrorPage } from "@saroh/ui/error-page";
import { reportError } from "@saroh/ui/lib/report-error";
import { Wordmark } from "@saroh/ui/wordmark";
import { useEffect } from "react";

/**
 * App-root error boundary. Every screen here reads or writes the session
 * through api.saroh.in, so an api that is down or restarting is the most
 * likely thing to land here — and this app is where a signed-out user is sent
 * to recover, which makes an unstyled crash the end of the road rather than a
 * detour. Drawn like the 404 beside it, on the layout's backdrop.
 *
 * Deliberately says nothing about credentials. "Something went wrong" while
 * signing in must not hint at whether an account exists or a password matched;
 * that is the api's answer to give, inline, not this boundary's to guess at.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, { boundary: "accounts/root", digest: error.digest });
    }, [error]);

    return (
        <main className="flex min-h-screen items-center justify-center">
            <ErrorPage
                mark={<Wordmark style={{ fontSize: "1.75rem" }} />}
                description="We couldn’t complete that. It’s usually temporary, so try again in a moment."
                onRetry={retry}
                home={{ href: "/apps", label: "Go to your apps" }}
                digest={error.digest}
            />
        </main>
    );
}
