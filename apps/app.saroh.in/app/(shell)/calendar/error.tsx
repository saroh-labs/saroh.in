"use client";

import { SectionError } from "@/components/shared/section-error";

/** The month could not be read at all; a single layer failing is not this. */
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
            heading="Calendar"
            things="the calendar"
            reassurance="Your orders, subscriptions, invoices and bookings are where they were."
        />
    );
}
