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
            title="Couldn't load settings"
            description="Nothing was changed. Try again, or head back and come at it fresh."
            backHref="/"
            backLabel="Back to Home"
        />
    );
}
