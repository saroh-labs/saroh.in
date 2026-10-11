import { plural } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { planLabel } from "@saroh/ui/lib/state-copy";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { BillingAccessView } from "@/lib/billing/access";
import { upgradeHref } from "@/lib/billing/access";
import { Notice } from "@saroh/ui/notice";
import { PlanWay } from "./plan-way";

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
        <Notice
            tone="info"
            layout="banner"
            // Saroh's words and Saroh's plan names; the day count and the
            // date's digits are hidden in a recording all the same.
            data-ph-unmask=""
        >
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                <p className="min-w-0 flex-[1_1_320px] text-pretty text-[13px] leading-normal text-foreground">
                    <span className="font-semibold">
                        Your {ending.planName} plan ends in {days}{" "}
                        {plural(days, "day")}
                    </span>
                    , on <ViewerDate iso={ending.endsAt} />. After that
                    you&rsquo;re on {ending.nextPlanName}, and everything you
                    made is kept.
                </p>
                <PlanWay className="text-foreground/80">
                    <Button asChild size="sm" className="shrink-0">
                        <Link href={upgradeHref()}>{planLabel()}</Link>
                    </Button>
                </PlanWay>
            </div>
        </Notice>
    );
}
