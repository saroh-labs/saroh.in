"use client";

import { ctaClasses } from "@saroh/site-blocks";
import { useEffect } from "react";

/**
 * Segment error boundary, rendered inside the layout — so `SiteTheme` is
 * already mounted and the merchant's own palette is in scope. Styled from the
 * `--site-*` layer, never Saroh's brand tokens: this is still the merchant's
 * website, and the same reasoning as the sibling 404.
 *
 * Names nothing about what failed. A visitor cannot act on "the publication
 * read timed out", and a merchant's customer reading our internals on their
 * shopfront is its own kind of broken.
 */
export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // TODO(#103): forward to error tracking once observability lands.
        console.error(error);
    }, [error]);

    return (
        <div className="mx-auto flex min-h-[60vh] w-full max-w-screen-sm flex-col items-center justify-center px-5 py-16 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-site-fg sm:text-4xl">
                This page isn&rsquo;t loading
            </h1>
            <p className="mt-3 text-base text-site-body">
                Something went wrong. It is usually temporary — please try
                again.
            </p>
            {error.digest && (
                <p className="mt-4 font-mono text-xs text-site-muted">
                    Reference: {error.digest}
                </p>
            )}
            <button onClick={reset} className={`${ctaClasses("primary")} mt-8`}>
                Try again
            </button>
        </div>
    );
}
