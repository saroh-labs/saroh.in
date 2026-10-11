"use client";

import { CrashDocument } from "@saroh/ui/crash-page";
import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

/**
 * The last boundary in accounts: the root layout itself threw, so Next renders
 * this in place of the whole document, with none of the layout's CSS or
 * fonts. `CrashDocument` carries its own small stylesheet and keeps the shape
 * of every other error page (`@saroh/ui/error-page`). Nothing about the error
 * is shown, only Next's digest as a reference.
 *
 * The way on is "/", not the app's address read from the environment: this
 * page is what is left when something as basic as that failed to load, so it
 * imports nothing of the app's. The proxy sends "/" on to Saroh for someone
 * signed in, and to sign in for anyone else.
 */
export default function GlobalError({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, {
            boundary: "accounts/global",
            digest: error.digest,
        });
    }, [error]);

    return (
        <CrashDocument
            onRetry={retry}
            homeHref="/"
            homeLabel="Go to Saroh"
            description="Your Saroh account couldn’t open this page. It’s usually temporary, so try again in a moment."
            digest={error.digest}
        />
    );
}
