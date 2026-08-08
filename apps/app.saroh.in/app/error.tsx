"use client";

import { Button } from "@saroh/ui/button";
import { useEffect } from "react";

/**
 * App-root error boundary. A thrown data fetch (e.g. the API is down) lands
 * here with a retry affordance instead of Next's default unstyled error screen
 * — and, paired with services that THROW on real failures (#101), a genuine
 * outage no longer masquerades as an empty state.
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
                We couldn&apos;t load this page. This is usually temporary —
                please try again.
            </p>
            <Button onClick={reset}>Try again</Button>
        </main>
    );
}
