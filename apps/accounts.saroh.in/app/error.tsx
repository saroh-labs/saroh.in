"use client";

import { Button } from "@saroh/ui/button";
import { useEffect } from "react";

/**
 * App-root error boundary. Every screen here reads or writes the session
 * through api.saroh.in, so an api that is down or restarting is the most
 * likely thing to land here — and this app is where a signed-out user is sent
 * to recover, which makes an unstyled crash the end of the road rather than a
 * detour.
 *
 * Deliberately says nothing about credentials. "Something went wrong" while
 * signing in must not hint at whether an account exists or a password matched;
 * that is the api's answer to give, inline, not this boundary's to guess at.
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
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="text-muted-foreground text-sm">
                We couldn&apos;t complete that. This is usually temporary —
                please try again.
            </p>
            {error.digest && (
                <p className="text-muted-foreground font-mono text-xs">
                    Reference: {error.digest}
                </p>
            )}
            <Button onClick={reset}>Try again</Button>
        </main>
    );
}
