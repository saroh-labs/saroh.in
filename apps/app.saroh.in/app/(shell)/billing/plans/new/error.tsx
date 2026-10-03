"use client";

import { SectionError } from "@/components/shared/section-error";
import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";

/** The plans beside a new one couldn't be read: nothing was saved. */
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
            title="Couldn't open a new plan"
            description="The connection dropped while we were getting it ready. Nothing was saved — try again, or come back in a minute."
            backHref={PLANS_HREF}
            backLabel="Back to plans"
        />
    );
}
