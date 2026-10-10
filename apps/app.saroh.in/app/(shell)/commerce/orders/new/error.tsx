"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * New order couldn't be opened. Its own boundary, so it isn't told the
 * Orders list failed (B7 gave the list one): nothing was taken or saved.
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
            heading="New order"
            things="the new order form"
            reassurance="Nothing has been taken or saved."
            backHref="/commerce/orders"
            place="Orders"
        />
    );
}
