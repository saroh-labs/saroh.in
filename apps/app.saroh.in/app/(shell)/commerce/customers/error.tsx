"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * The Customers list couldn't be read (C4): said as a failure with Try
 * again — never an empty list, which would read as a business nobody has
 * paid — and that nothing was changed. A denial renders as a denial.
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
            title="Couldn't load customers"
            description="Something went wrong on our side, so this may not be the whole picture. Nothing has been changed."
            backHref="/"
            backLabel="Back to Home"
        />
    );
}
