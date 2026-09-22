"use client";

import { SectionError } from "@/components/shared/section-error";

/** A read that failed is not an empty list: nobody's subscription changed. */
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
            title="Subscriptions could not be loaded"
            description="This screen could not read them. Nothing has been changed — every membership is still running, and renewals still go out."
            backHref="/"
            backLabel="Back to Home"
        />
    );
}
