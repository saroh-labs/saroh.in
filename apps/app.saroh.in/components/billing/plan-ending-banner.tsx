import { Button } from "@saroh/ui/button";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { BillingAccessView } from "@/lib/billing/access";
import { upgradeHref } from "@/lib/billing/access";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days left, rounded up: "1 day" in the last 24 hours, never "0". */
export function daysLeft(endsAt: string, now: Date): number {
    return Math.max(
        1,
        Math.ceil((new Date(endsAt).getTime() - now.getTime()) / DAY_MS),
    );
}

/**
 * The countdown to a plan that ends (#805): a launch offer, or a plan Saroh
 * gave for a while, that moves the business to a cheaper one. Shown above
 * every page in its last 30 days (the API decides, `planEnding`), with the
 * way to stay on it; the same end is emailed 30, 7 and 1 days ahead.
 * Nothing when there is none, or the role can't read billing.
 */
export function PlanEndingBanner({
    ending,
    now = new Date(),
}: {
    ending: BillingAccessView["planEnding"] | undefined;
    now?: Date;
}) {
    if (!ending) return null;
    const days = daysLeft(ending.endsAt, now);
    return (
        <div
            role="status"
            className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-brand-300 bg-brand-subtle px-4 py-2.5 dark:border-brand-700 sm:px-6"
        >
            <p className="min-w-0 flex-[1_1_320px] text-pretty text-[13px] leading-normal text-foreground">
                <span className="font-semibold">
                    Your {ending.planName} plan ends in {days}{" "}
                    {days === 1 ? "day" : "days"}
                </span>
                , on <ViewerDate iso={ending.endsAt} />. After that you&rsquo;re
                on {ending.nextPlanName}, and everything you made is kept.
            </p>
            <Button asChild size="sm" className="shrink-0">
                <Link href={upgradeHref()}>Choose a plan</Link>
            </Button>
        </div>
    );
}
