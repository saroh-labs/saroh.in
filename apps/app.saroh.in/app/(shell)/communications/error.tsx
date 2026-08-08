"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * Segment error boundary. Keeps the app chrome intact so a failure here costs
 * the merchant this panel, not their ability to navigate — see SectionError.
 */
export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <SectionError
            error={error}
            reset={reset}
            title="Couldn't load messages"
            description="Nothing was sent or lost — this page just failed to render."
            backHref="/"
            backLabel="Back to Home"
        />
    );
}
