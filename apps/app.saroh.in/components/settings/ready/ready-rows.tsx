import { Button } from "@saroh/ui/button";
import { WHO_CAN_CHANGE_PLAN } from "@saroh/ui/lib/state-copy";
import Link from "next/link";

import { PlanWay } from "@/components/billing/plan-way";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { isPlanHref } from "@/lib/billing/plan-access";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import type { ReadyAside, ReadyStep } from "@/lib/settings/ready";
import type { ChecklistRow } from "@/lib/setup-checklist";

/**
 * What "Finish setup" lists on Home and Settings › Business, as the one
 * checklist's rows (`components/shared/setup-checklist/setup-checklist.tsx`): the same
 * steps on both, each with why it matters and one button to where it is
 * done. Most open a row's sheet in place (`?edit=`).
 *
 * A step whose button is the way to another plan is a plan prompt like
 * any other: someone who can't change the plan (`canChangePlan`, the
 * shell's `useCanChangePlan`) gets no button, and who can after why it
 * matters. Absent: the link shows, as outside the shell.
 */
export function readyRows(
    steps: readonly ReadyStep[],
    canChangePlan = true,
): ChecklistRow[] {
    return steps.map((step) => ({
        key: step.key,
        label: step.label,
        done: step.done,
        broken: step.broken,
        ...planRow(
            { label: step.cta, href: step.href },
            canChangePlan,
            step.why,
        ),
    }));
}

/**
 * A row's button and its line, by whether the reader may follow it: the
 * link as given, or, for the way to a plan someone can't change, no button
 * and who can (`WHO_CAN_CHANGE_PLAN`) after the line. Row data only, so
 * the one checklist draws it like any other step nobody here can do.
 * While plans aren't shown (DEC-136) the way to a plan is neither.
 */
export function planRow(
    action: { label: string; href: string },
    canChangePlan: boolean,
    why?: string,
): Pick<ChecklistRow, "action" | "why"> {
    if (isPlanHref(action.href) && !plansShown()) {
        return why ? { why } : {};
    }
    if (canChangePlan || !isPlanHref(action.href)) {
        return { action, ...(why ? { why } : {}) };
    }
    return { why: why ? `${why} ${WHO_CAN_CHANGE_PLAN}` : WHO_CAN_CHANGE_PLAN };
}

/**
 * What the plan holds back (taking payment online on a plan without it,
 * DEC-092): listed under the steps, outside the count and the bar, with the
 * plan that has it. So the count can reach all done without it. Nothing
 * while plans aren't shown (DEC-136).
 */
export function PlanAsides({ items }: { items: readonly ReadyAside[] }) {
    if (items.length === 0 || !plansShown()) return null;
    return (
        <ul
            aria-label="Not counted: comes with another plan"
            className="grid gap-1 border-t border-border pt-2"
        >
            {items.map((item) => (
                <li
                    key={item.key}
                    className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1.5 py-1 text-[13px]"
                >
                    <span
                        aria-hidden
                        className="size-4 shrink-0 rounded-full border-[1.5px] border-dashed border-border-strong"
                    />
                    <span className="grid min-w-0 flex-[1_1_200px] gap-px">
                        <span className="flex flex-wrap items-center gap-2 font-medium">
                            {item.label}
                            <StatusBadge tone="neutral">
                                {item.comesWith}
                            </StatusBadge>
                        </span>
                        <span className="text-pretty text-[12.5px] leading-[1.45] text-muted-foreground">
                            {item.why}
                        </span>
                    </span>
                    {/* The way to the plan for someone who may change
                        it; who can, for anyone else. */}
                    <PlanWay when={isPlanHref(item.href)}>
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                        >
                            <Link href={item.href}>{item.cta}</Link>
                        </Button>
                    </PlanWay>
                </li>
            ))}
        </ul>
    );
}
