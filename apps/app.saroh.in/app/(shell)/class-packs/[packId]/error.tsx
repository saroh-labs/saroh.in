"use client";

import { SectionError } from "@/components/shared/section-error";

/** A read that failed is not a missing pack: nothing about it changed. */
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
            title="Couldn't load this pack"
            description="The connection dropped while we were fetching it. Nothing has changed — try again, or come back in a minute."
            backHref="/class-packs"
            backLabel="Back to Packs"
        />
    );
}
