"use client";

import { SectionError } from "@/components/shared/section-error";

/** A failed read of one invoice: said as that, with a way back. */
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
            title="This invoice could not be loaded"
            description="Nothing has been changed — it keeps its number, its lines and its payments."
            backHref="/billing/invoices"
            backLabel="Back to invoices"
        />
    );
}
