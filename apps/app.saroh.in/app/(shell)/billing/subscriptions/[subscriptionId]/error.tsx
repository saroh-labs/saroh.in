"use client";

import { SectionError } from "@/components/shared/states/section-error";

/** A read that failed is not a missing subscription: nothing about it changed. */
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
            heading="Subscription"
            things="this subscription"
            reassurance="It still renews, and its invoices still go out."
            backHref="/billing/subscriptions"
            place="Subscriptions"
        />
    );
}
