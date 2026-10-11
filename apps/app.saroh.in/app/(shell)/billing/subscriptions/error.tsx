"use client";

import { SectionError } from "@/components/shared/section-error";

/** A read that failed is not an empty list: nobody's subscription changed. */
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
            heading="Subscriptions"
            things="subscriptions"
            reassurance="Every membership is still running, and renewals still go out."
        />
    );
}
