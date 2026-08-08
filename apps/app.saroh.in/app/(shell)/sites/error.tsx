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
            title="Couldn't load your website"
            description="Your published site is unaffected — this is the editor failing to load."
            backHref="/"
            backLabel="Back to Home"
        />
    );
}
