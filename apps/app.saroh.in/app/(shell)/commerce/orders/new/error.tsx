"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * New order couldn't be opened. Its own boundary, so it isn't told the
 * Orders list failed (B7 gave the list one): nothing was taken or saved.
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
            title="Couldn't open a new order"
            description="Something went wrong on our side. Nothing has been taken or saved."
            backHref="/commerce/orders"
            backLabel="Back to orders"
        />
    );
}
