"use client";

import { SectionError } from "@/components/shared/states/section-error";

/** A read that failed is not an empty list: nobody's enrolment changed. */
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
            heading="Courses"
            things="courses"
            reassurance="Everyone enrolled is still booked on their sessions."
        />
    );
}
