import { Button } from "@saroh/ui/button";
import { planLabel } from "@saroh/ui/lib/state-copy";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { PausedView } from "@/lib/billing/paused";
import { PLAN_AND_BILLING_HREF, pausedBanner } from "@/lib/billing/paused";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import { Notice } from "@saroh/ui/notice";
import { TextLink } from "@saroh/ui/text-link";
import { PlanWay } from "./plan-way";

/**
 * Above every page while a move to a lower plan has paused something, or
 * will (#800, #801): what, when, and the way to keep everything. Said in
 * words, not by colour: "Paused by your plan" or "will pause on …". The
 * API decides (`GET …/billing/paused`); nothing when nothing is over, the
 * read failed, nothing is enforced, or plans aren't shown (DEC-136).
 */
export function PausedBanner({ view }: { view: PausedView | null }) {
    if (!plansShown()) return null;
    const b = pausedBanner(view);
    if (!b) return null;
    return (
        <Notice tone="warning" layout="banner" align="center">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                <p className="min-w-0 flex-[1_1_320px] text-pretty text-[13px] leading-normal text-warning-subtle-foreground">
                    <span className="font-semibold">
                        {b.title}
                        {b.pausesFrom ? (
                            <>
                                {" "}
                                on <ViewerDate iso={b.pausesFrom} />
                            </>
                        ) : null}
                        .
                    </span>{" "}
                    {b.body}
                </p>
                <PlanWay className="text-foreground/80">
                    <Button asChild size="sm" className="shrink-0">
                        <Link href={PLAN_AND_BILLING_HREF}>{planLabel()}</Link>
                    </Button>
                </PlanWay>
            </div>
        </Notice>
    );
}

/**
 * One line saying why something is paused, where it is listed or edited:
 * the words and the way back, never only a tag or a hover (four scenes).
 */
export function PausedNote({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    if (!plansShown()) return null;
    return (
        <Notice tone="warning" role="note" className={className}>
            {children}{" "}
            <PlanWay className="text-[length:inherit] text-inherit">
                <TextLink href={PLAN_AND_BILLING_HREF}>{planLabel()}</TextLink>
            </PlanWay>
        </Notice>
    );
}
