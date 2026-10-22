"use client";

import { SectionError } from "@/components/shared/states/section-error";

/**
 * The Customers list couldn't be read (C4): said as a failure with Try
 * again — never an empty list, which would read as a business nobody has
 * paid — and that nothing was changed. A denial renders as a denial.
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
            heading="Customers"
            things="customers"
        />
    );
}
