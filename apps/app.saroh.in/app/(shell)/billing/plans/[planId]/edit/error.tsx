"use client";

import { SectionError } from "@/components/shared/section-error";
import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";

/**
 * The editor couldn't read the plan: said as a failed read, not a missing
 * plan, and nothing about it changed (the design's "Couldn't load").
 */
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
            description="The connection dropped while we were fetching it. Nothing has changed — try again, or come back in a minute."
            backHref={PLANS_HREF}
            backLabel="Back to plans"
        />
    );
}
