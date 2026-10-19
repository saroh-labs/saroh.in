"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * A booking that couldn't be read (U12): "Couldn't load this booking",
 * with Try again reading it again and the way back to All bookings. A
 * booking that isn't there is the 404, not this.
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
            heading="Booking"
            things="this booking"
            reassurance="Your bookings are safe."
            backHref="/bookings/all"
            place="All bookings"
        />
    );
}
