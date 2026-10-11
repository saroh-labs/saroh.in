"use client";

import { SectionError } from "@/components/shared/section-error";

/** A read that failed is not a missing person: nothing about them changed. */
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
            heading="Contact"
            things="this person"
            backHref="/contacts"
            place="Contacts"
        />
    );
}
