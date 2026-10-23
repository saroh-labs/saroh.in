"use client";

import { SectionError } from "@/components/shared/states/section-error";

/**
 * The order could not be read. The kitchen keeps working from the printed
 * ticket, and nothing changed — the design's "Couldn't load this order".
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    return (
        <SectionError
            error={error}
            retry={retry}
            heading="Order"
            things="this order"
            reassurance="The team can keep working from the printed ticket."
            backHref="/commerce/orders"
            place="Orders"
        />
    );
}
