"use client";

import { SectionError } from "@/components/shared/states/section-error";
import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";

/** A read that failed is not a missing plan: nothing about it changed. */
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
            heading="Plan"
            things="this plan"
            backHref={PLANS_HREF}
            place="Plans"
        />
    );
}
