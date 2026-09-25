"use client";

import { SectionError } from "@/components/shared/section-error";

/** A read that failed is not a missing subscription: nothing about it changed. */
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
            title="This subscription could not be loaded"
            description="This screen could not read it. Nothing has been changed — it still renews, and its invoices still go out."
            backHref="/billing/subscriptions"
            backLabel="Back to subscriptions"
        />
    );
}
