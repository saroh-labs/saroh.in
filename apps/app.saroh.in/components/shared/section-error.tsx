"use client";

import { Button } from "@saroh/ui/button";
import { FailedState, PermissionDeniedState } from "@saroh/ui/data-state";
import Link from "next/link";
import { useEffect } from "react";

import { isDenial, statusFromError } from "@/lib/api/errors";

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
 * ## A denial is not a failure (#177, §30)
 *
 * This used to render one thing for everything that threw. A MEMBER opening a
 * page their role does not cover was told "Couldn't load this — this is
 * usually temporary. Try again", which is false on both counts: nothing is
 * broken, and trying again will do exactly the same thing forever. §30 asks
 * for permission denial to be explained rather than presented as a breakage.
 *
 * So a 401/403 renders {@link PermissionDeniedState} — no retry, because there
 * is nothing to retry — and everything else renders {@link FailedState}, which
 * keeps the retry as its primary action. The two are distinguishable by shape,
 * icon, wording and ARIA, not by colour.
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

    const denied = isDenial(error);
    const status = statusFromError(error);

    /*
     * The digest is the only handle support has on a specific failure, and
     * asking a merchant to open devtools to find it is not a support process.
     * Shown only when Next actually produced one, and never on a denial —
     * nothing went wrong there, so there is nothing to report.
     */
    const reference =
        !denied && error.digest ? (
            <p className="font-mono text-xs text-muted-foreground/70">
                Reference: {error.digest}
            </p>
        ) : null;

    if (denied) {
        return (
            <main className="mx-auto w-full max-w-md p-6 sm:p-12">
                <PermissionDeniedState
                    title={
                        status === 401
                            ? "Your session has ended"
                            : "You do not have access to this"
                    }
                    description={
                        status === 401
                            ? "Sign in again to pick up where you left off."
                            : "This section is limited to certain roles in this organization. An owner or admin can change what you can reach."
                    }
                    action={
                        <Button asChild variant="outline" className="wk-press">
                            <Link href={backHref}>{backLabel}</Link>
                        </Button>
                    }
                />
            </main>
        );
    }

    return (
        <main className="mx-auto w-full max-w-md p-6 sm:p-12">
            <FailedState
                title={title}
                description={description}
                action={
                    <div className="flex flex-col items-center gap-3">
                        {reference}
                        <div className="flex items-center gap-2">
                            <Button onClick={reset} className="wk-press">
                                Try again
                            </Button>
                            <Button
                                asChild
                                variant="ghost"
                                className="wk-press"
                            >
                                <Link href={backHref}>{backLabel}</Link>
                            </Button>
                        </div>
                    </div>
                }
            />
        </main>
    );
}
