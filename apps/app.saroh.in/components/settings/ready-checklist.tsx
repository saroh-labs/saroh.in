import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { SetupChecklist } from "@/components/shared/setup-checklist";
import type {
    ReadyChecklist as Checklist,
    ReadyStep,
} from "@/lib/settings/ready";
import { checklistWords } from "@/lib/settings/ready";

import { PlanAsides, readyRows } from "./ready-rows";

/**
 * "Finish setup" on Settings › Business ("Saroh Settings" design): the one
 * "what's left" card on Business, drawn by the one checklist
 * (`components/shared/setup-checklist.tsx`). The page's layout places it
 * (`SettingsColumns`): above the tabs, and to their right on a wide screen,
 * as on Sell › Location. The steps and the count are Home's
 * (`readyChecklist`, F8, UX-019), under the same name, and the line under
 * it follows the steps (DEC-070): with nothing that invoices or takes
 * money, it is about the site.
 *
 * What the plan holds back (taking payment online on a plan without it,
 * DEC-092) is listed under the steps, outside the count, with the plan that
 * has it and See plans — so the count can reach all done without it.
 *
 * What Settings also suggests — email, business type, logo, a pipeline
 * (`settingsChecklist`, DEC-056) — is "Make it yours", under the steps in
 * the same card, ruled off and never counted. Once every counted step is
 * done the card says so, then folds to one quiet line, and "Make it yours"
 * stays under it while anything is left there.
 */
export function ReadyChecklist({
    list,
    businessId,
    canChangePlan = true,
}: {
    list: Checklist;
    /** What the finished state is remembered by, in this browser. */
    businessId?: string;
    /**
     * Whether the reader may change the plan (`mayChangePlan`): a step
     * that is the way to another plan is offered only then.
     */
    canChangePlan?: boolean;
}) {
    if (!readyHasCard(list)) return null;
    const extras = (list.extras ?? []).filter((e) => !e.done);
    const counted = list.total > 0;
    const finished = counted && list.done >= list.total;
    const more =
        extras.length > 0 ? (
            <MakeItYours items={extras} ruled={counted && !finished} />
        ) : null;

    if (!counted) {
        return (
            <section
                aria-label="Make it yours"
                className="grid gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
                {more}
            </section>
        );
    }
    return (
        <div className="grid gap-3">
            <SetupChecklist
                name="business"
                {...checklistWords(list)}
                rows={readyRows(list.steps, canChangePlan)}
                foldKey={businessId ? `business:${businessId}` : undefined}
            >
                {finished ? null : (
                    <>
                        <PlanAsides items={list.outside} />
                        {more}
                    </>
                )}
            </SetupChecklist>
            {finished && more ? (
                <section
                    aria-label="Make it yours"
                    className="grid gap-3 rounded-xl border border-border bg-card px-4 py-3"
                >
                    {more}
                </section>
            ) : null}
        </div>
    );
}

/**
 * Whether the card has anything to draw, so a layout can leave its place
 * out: counted steps (left, or done and said so), or a suggestion left.
 */
export function readyHasCard(list: Checklist): boolean {
    return list.total > 0 || (list.extras ?? []).some((e) => !e.done);
}

/**
 * "Make it yours" (UX-019): what Settings suggests beyond taking money.
 * Quiet, uncounted, no bar: a suggestion, not a step left.
 */
function MakeItYours({
    items,
    ruled,
}: {
    items: ReadyStep[];
    /** Under the counted steps: ruled off from them. */
    ruled: boolean;
}) {
    return (
        <div
            role="group"
            aria-label="Make it yours"
            className={cn("grid gap-2", ruled && "border-t border-border pt-3")}
        >
            <h3 className="font-display text-[14px] font-semibold tracking-[-0.01em]">
                Make it yours
            </h3>
            <ul className="grid gap-1">
                {items.map((item) => (
                    <li
                        key={item.key}
                        className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1.5 py-1 text-[13px]"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "size-4 shrink-0 rounded-full border-[1.5px]",
                                item.broken
                                    ? "border-destructive"
                                    : "border-dashed border-border-strong",
                            )}
                        />
                        <span className="grid min-w-0 flex-[1_1_200px] gap-px">
                            <span className="font-medium">{item.label}</span>
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
        </div>
    );
}
