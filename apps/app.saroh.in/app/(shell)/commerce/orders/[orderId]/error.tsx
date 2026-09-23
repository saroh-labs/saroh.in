"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * The order could not be read. The kitchen keeps working from the printed
 * ticket, and nothing changed — the design's "Couldn't load this order".
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
            title="Couldn't load this order"
            description="The kitchen can keep working from the printed ticket. Nothing has changed."
            backHref="/commerce/orders"
            backLabel="Back to orders"
        />
    );
}
