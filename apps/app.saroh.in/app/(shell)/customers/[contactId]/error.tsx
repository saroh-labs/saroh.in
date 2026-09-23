"use client";

import { SectionError } from "@/components/shared/section-error";

/** A read that failed is not a missing customer: nothing about them changed. */
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
            title="Couldn't load this customer"
            description="The connection dropped. Nothing about them has changed."
            backHref="/contacts"
            backLabel="Back to contacts"
        />
    );
}
