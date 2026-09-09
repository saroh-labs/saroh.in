"use client";

import { Button } from "@saroh/ui/button";
import { useEffect } from "react";

/**
 * App-root error boundary. The control plane reads everything through
 * api.saroh.in, so an api that is down or restarting is the most likely thing
 * to land here — and it must land as a retry, not as a sign-out or Next's
 * default unstyled screen. See lib/session.ts.
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
        <main className="mx-auto flex max-w-4xl flex-col items-center gap-4 p-16 text-center">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="max-w-md text-sm text-muted-foreground">
                We couldn&apos;t load the control plane. This is usually
                temporary — please try again.
            </p>
            {error.digest && (
                <p className="font-mono text-xs text-muted-foreground">
                    Reference: {error.digest}
                </p>
            )}
            <Button onClick={reset}>Try again</Button>
        </main>
    );
}
