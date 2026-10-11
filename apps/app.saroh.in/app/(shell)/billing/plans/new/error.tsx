"use client";

import { SectionError } from "@/components/shared/section-error";
import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";

/** The plans beside a new one couldn't be read: nothing was saved. */
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
            heading="New plan"
            things="the new plan form"
            reassurance="Nothing was saved."
            backHref={PLANS_HREF}
            place="Plans"
        />
    );
}
