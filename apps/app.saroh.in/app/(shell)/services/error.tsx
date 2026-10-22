"use client";

import { SectionError } from "@/components/shared/states/section-error";

/**
 * Segment error boundary. Keeps the app chrome intact so a failure here costs
 * the merchant this panel, not their ability to navigate — see SectionError.
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
            heading="Services"
            things="services"
        />
    );
}
