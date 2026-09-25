"use client";

import { SectionError } from "@/components/shared/section-error";

/** The month could not be read at all; a single layer failing is not this. */
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
            title="Couldn't load the calendar"
            description="Nothing is lost — the calendar only reads your orders, subscriptions, invoices and bookings, and they are where they were."
            backHref="/"
            backLabel="Back to Home"
        />
    );
}
