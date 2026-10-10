import { Button } from "@saroh/ui/button";
import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import type { ReadyAside, ReadyStep } from "@/lib/settings/ready";
import type { ChecklistRow } from "@/lib/setup-checklist";

/**
 * What "Finish setup" lists on Home and Settings › Business, as the one
 * checklist's rows (`components/shared/setup-checklist.tsx`): the same
 * steps on both, each with why it matters and one button to where it is
 * done. Most open a row's sheet in place (`?edit=`).
 */
export function readyRows(steps: readonly ReadyStep[]): ChecklistRow[] {
    return steps.map((step) => ({
        key: step.key,
        label: step.label,
        done: step.done,
        why: step.why,
        broken: step.broken,
        action: { label: step.cta, href: step.href },
    }));
}

/**
 * What the plan holds back (taking payment online on a plan without it,
 * DEC-092): listed under the steps, outside the count and the bar, with the
 * plan that has it. So the count can reach all done without it.
 */
export function PlanAsides({ items }: { items: readonly ReadyAside[] }) {
    if (items.length === 0) return null;
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
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                    >
                        <Link href={item.href}>{item.cta}</Link>
                    </Button>
                </li>
            ))}
        </ul>
    );
}
