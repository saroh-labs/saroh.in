"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * A read that failed is not an empty list: this says the invoices could not
 * be read, and that none were changed.
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
            heading="Invoices"
            things="invoices"
            reassurance="Every invoice that was issued is still there, with its number and its payments."
        />
    );
}
