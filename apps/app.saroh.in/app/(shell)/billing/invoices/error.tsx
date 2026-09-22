"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * A read that failed is not an empty list: this says the invoices could not
 * be read, and that none were changed.
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
            title="Invoices could not be loaded"
            description="This screen could not read them. Nothing has been changed — every invoice that was issued is still there, with its number and its payments."
            backHref="/"
            backLabel="Back to Home"
        />
    );
}
