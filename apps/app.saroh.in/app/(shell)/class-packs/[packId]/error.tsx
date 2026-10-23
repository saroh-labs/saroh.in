"use client";

import { SectionError } from "@/components/shared/states/section-error";

/** A read that failed is not a missing pack: nothing about it changed. */
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
            heading="Class pack"
            things="this pack"
            backHref="/class-packs"
            place="Class packs"
        />
    );
}
