"use client";

import { SectionError } from "@/components/shared/states/section-error";

/** A read that failed is not an empty list: nobody's classes changed. */
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
            heading="Class packs"
            things="class packs"
            reassurance="Everyone holding a pack still has the classes they had."
        />
    );
}
