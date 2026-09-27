"use client";

import { SectionError } from "@/components/shared/section-error";
import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";

/** A read that failed is not a missing plan: nothing about it changed. */
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
            title="Couldn't load this plan"
            description="This screen couldn't read it. Nothing has changed — try again, or come back in a minute."
            backHref={PLANS_HREF}
            backLabel="Back to plans"
        />
    );
}
