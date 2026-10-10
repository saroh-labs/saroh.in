"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * The Products list couldn't be read (#519, the design's failed state):
 * said as a failure with Try again — never an empty catalogue — and that
 * nothing was changed or deleted. A denial renders as a denial.
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
            heading="Products"
            things="products"
            reassurance="No product has been deleted."
        />
    );
}
