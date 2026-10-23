"use client";

import { SectionError } from "@/components/shared/states/section-error";
import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";

/**
 * The editor couldn't read the plan: said as a failed read, not a missing
 * plan, and nothing about it changed (the design's "Couldn't load").
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
            heading="Edit plan"
            things="this plan"
            backHref={PLANS_HREF}
            place="Plans"
        />
    );
}
