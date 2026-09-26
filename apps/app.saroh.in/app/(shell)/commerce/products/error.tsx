"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * The Products list couldn't be read (#519, the design's failed state):
 * said as a failure with Try again — never an empty catalogue — and that
 * nothing was changed or deleted. A denial renders as a denial.
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
            title="Couldn't load products"
            description="Something went wrong on our side, so this may not be the whole picture. Nothing has been changed, and no product has been deleted."
            backHref="/"
            backLabel="Back to Home"
        />
    );
}
