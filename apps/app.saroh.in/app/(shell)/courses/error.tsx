"use client";

import { SectionError } from "@/components/shared/section-error";

/** A read that failed is not an empty list: nobody's enrolment changed. */
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
            title="Courses could not be loaded"
            description="This screen could not read them. Nothing has been changed — everyone enrolled is still booked on their sessions."
            backHref="/"
            backLabel="Back to Home"
        />
    );
}
