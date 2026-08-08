"use client";

import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { useEffect } from "react";

/**
 * The shared body of every segment-level `error.tsx`.
 *
 * Why segment boundaries exist at all: `app/error.tsx` sits at the ROOT, so it
 * replaces the whole document — sidebar, header and all. A failed query on one
 * orders page therefore took away the merchant's ability to navigate anywhere
 * else, turning a transient API hiccup into "the app is down". A boundary
 * inside `(shell)` renders in the content area with the chrome intact, so the
 * blast radius is the panel that actually failed.
 *
 * `reset()` re-renders the segment. It is offered first because most failures
 * here are transient (a dropped connection, a cold API), and the secondary link
 * is the escape hatch for when it is not.
 */
export function SectionError({
    error,
    reset,
    title = "Couldn't load this",
    description = "This is usually temporary. Try again, or head back and come at it fresh.",
    backHref = "/",
    backLabel = "Back to Home",
}: {
    error: Error & { digest?: string };
    reset: () => void;
    title?: string;
    description?: string;
    backHref?: string;
    backLabel?: string;
}) {
    useEffect(() => {
        // TODO(#103): forward to error tracking once observability lands.
        console.error(error);
    }, [error]);

    return (
        <main
            className="mx-auto flex w-full max-w-md flex-col items-center gap-4 p-12 text-center"
            role="alert"
        >
            <h1 className="font-display text-xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
            {/* The digest is the only handle support has on a specific failure,
                and asking a merchant to open devtools to find it is not a
                support process. Shown only when Next actually produced one. */}
            {error.digest ? (
                <p className="font-mono text-xs text-muted-foreground/70">
                    Reference: {error.digest}
                </p>
            ) : null}
            <div className="mt-1 flex items-center gap-2">
                <Button onClick={reset} className="wk-press">
                    Try again
                </Button>
                <Button asChild variant="ghost" className="wk-press">
                    <Link href={backHref}>{backLabel}</Link>
                </Button>
            </div>
        </main>
    );
}
