"use client";

import { SectionError } from "@/components/shared/section-error";

/** A read that failed is not an empty list: nobody's classes changed. */
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
            title="Class packs could not be loaded"
            description="This screen could not read them. Nothing has been changed — everyone holding a pack still has the classes they had."
            backHref="/"
            backLabel="Back to Home"
        />
    );
}
