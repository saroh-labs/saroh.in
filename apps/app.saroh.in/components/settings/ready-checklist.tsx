import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import type {
    ReadyChecklist as Checklist,
    ReadyStep,
} from "@/lib/settings/ready";
import { checklistHeading } from "@/lib/settings/ready";

/**
 * "Get ready to take money" ("Saroh Settings" design): a card at the top of
 * Business listing what is left, a bar for how far along the business is,
 * and a button per step to the place that does it. The steps and the count
 * are Home's (`readyChecklist`, F8, UX-019), under the same heading, which
 * follows the steps (DEC-070): with nothing that invoices or takes money,
 * it is about the site.
 *
 * What the plan holds back (taking payment online on a plan without it,
 * DEC-092) is listed under the steps, outside the count, with the plan that
 * has it and See plans — so the count can reach all done without it.
 *
 * What Settings also suggests — email, business type, logo, a pipeline
 * (`settingsChecklist`, DEC-056) — is "Make it yours", apart and never
 * counted. Nothing renders once nothing is left in either.
 */
export function ReadyChecklist({ list }: { list: Checklist }) {
    const counted = list.total > 0 && list.left.length > 0;
    const extras = (list.extras ?? []).filter((e) => !e.done);
    if (!counted && extras.length === 0) return null;
    return (
        <div className="grid gap-3">
            {counted ? <Steps list={list} /> : null}
            {extras.length > 0 ? <MakeItYours items={extras} /> : null}
        </div>
    );
}

/** The counted steps, Home's, with the plan's asides under them. */
function Steps({ list }: { list: Checklist }) {
    const pct = Math.round((100 * list.done) / list.total);
    const heading = checklistHeading(list);
    return (
        <section
            aria-label={heading}
            className="grid gap-2 rounded-xl border border-highlight-border bg-brand-subtle px-4 py-3"
        >
            <div className="flex flex-wrap items-baseline gap-2.5">
                <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em]">
                    {heading}
                </h3>
                <span className="text-[12.5px] text-foreground/80">
                    {list.done} of {list.total} done
                </span>
                <div
                    role="progressbar"
                    aria-label="Setup done"
                    aria-valuemin={0}
                    aria-valuemax={list.total}
                    aria-valuenow={list.done}
                    className="ml-auto h-1.5 max-w-[200px] flex-[1_1_120px] self-center overflow-hidden rounded-full bg-muted"
                >
                    <div
                        className="h-full rounded-full bg-highlight"
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
            <ul className="grid gap-2">
                {list.left.map((item) => (
                    <li
                        key={item.key}
                        className="flex flex-wrap items-center gap-2.5 text-[13px]"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "size-[7px] shrink-0 rounded-full",
                                item.broken ? "bg-destructive" : "bg-highlight",
                            )}
                        />
                        <span className="grid min-w-0 flex-[1_1_220px] gap-px">
                            <span>{item.label}</span>
                            <span className="text-pretty text-[12.5px] leading-[1.45] text-foreground/80">
                                {item.why}
                            </span>
                        </span>
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="wk-press"
                        >
                            <Link href={item.href}>{item.cta}</Link>
                        </Button>
                    </li>
                ))}
            </ul>
            {list.outside.length > 0 ? (
                <ul
                    aria-label="Not counted: comes with another plan"
                    className="grid gap-2 border-t border-highlight-border pt-2"
                >
                    {list.outside.map((item) => (
                        <li
                            key={item.key}
                            className="flex flex-wrap items-center gap-2.5 text-[13px]"
                        >
                            <span
                                aria-hidden
                                className="size-[7px] shrink-0 rounded-full border border-border-strong"
                            />
                            <span className="grid min-w-0 flex-[1_1_220px] gap-px">
                                <span className="flex flex-wrap items-center gap-2">
                                    {item.label}
                                    <span className="rounded-full bg-muted px-2 py-px text-[11.5px] font-medium text-muted-foreground">
                                        {item.comesWith}
                                    </span>
                                </span>
                                <span className="text-pretty text-[12.5px] leading-[1.45] text-foreground/80">
                                    {item.why}
                                </span>
                            </span>
                            <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="wk-press"
                            >
                                <Link href={item.href}>{item.cta}</Link>
                            </Button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}

/**
 * "Make it yours" (UX-019): what Settings suggests beyond taking money.
 * Quiet, uncounted, no bar: a suggestion, not a step left.
 */
function MakeItYours({ items }: { items: ReadyStep[] }) {
    return (
        <section
            aria-label="Make it yours"
            className="grid gap-2 rounded-xl border border-border bg-card px-4 py-3"
        >
            <h3 className="font-display text-[14px] font-semibold tracking-[-0.01em]">
                Make it yours
            </h3>
            <ul className="grid gap-2">
                {items.map((item) => (
                    <li
                        key={item.key}
                        className="flex flex-wrap items-center gap-2.5 text-[13px]"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "size-[7px] shrink-0 rounded-full",
                                item.broken
                                    ? "bg-destructive"
                                    : "border border-border-strong",
                            )}
                        />
                        <span className="grid min-w-0 flex-[1_1_220px] gap-px">
                            <span>{item.label}</span>
                            <span className="text-pretty text-[12.5px] leading-[1.45] text-muted-foreground">
                                {item.why}
                            </span>
                        </span>
                        <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="wk-press"
                        >
                            <Link href={item.href}>{item.cta}</Link>
                        </Button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
