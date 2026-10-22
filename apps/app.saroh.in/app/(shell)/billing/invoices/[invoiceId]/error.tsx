"use client";

import { SectionError } from "@/components/shared/states/section-error";

/** A failed read of one invoice: said as that, with a way back. */
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
            heading="Invoice"
            things="this invoice"
            reassurance="It keeps its number, its lines and its payments."
            backHref="/billing/invoices"
            place="Invoices"
        />
    );
}
