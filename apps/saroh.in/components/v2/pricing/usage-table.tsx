import { Fragment } from "react";

import { PRICING_COPY } from "@/content/pricing";
import { cn } from "@/lib/cn";
import type { PlanCardView, UsageView } from "@/lib/pricing-model";
import { NOT_INCLUDED } from "@/lib/pricing-model";

import { Container } from "../container";

/**
 * "Usage beyond your plan": the rows a business can add to, by group, one
 * column per plan as in "Compare the plans", each cell what the plan
 * includes and what more costs; the notes under it. Drawn like that table
 * (the featured column tinted, the frame scrolling sideways on a phone and
 * focusable so a keyboard can scroll it), and not at all when nothing can be
 * added.
 */
export function UsageTable({
    plans,
    usage,
}: {
    plans: PlanCardView[];
    usage: UsageView | null;
}) {
    if (!usage) return null;
    const tint = (featured: boolean) => (featured ? "bg-mk-tint" : undefined);
    return (
        <Container
            as="section"
            id="usage"
            aria-labelledby="usage-title"
            className="grid scroll-mt-6 gap-[18px] pt-[72px]"
        >
            <div className="grid gap-1.5">
                <h2
                    id="usage-title"
                    className="m-0 font-display text-mk-h2-xs font-bold"
                >
                    {PRICING_COPY.usageTitle}
                </h2>
                <p className="m-0 text-base text-mk-copy">
                    {PRICING_COPY.usageLead}
                </p>
            </div>
            <div
                role="region"
                aria-label="Usage table"
                tabIndex={0}
                className="relative min-w-0 overflow-x-auto rounded-[18px] border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
            >
                <table className="w-full min-w-[680px] border-collapse text-[15px]">
                    <caption className="sr-only">
                        {PRICING_COPY.usageTitle}
                    </caption>
                    <thead>
                        <tr className="text-left">
                            <th
                                scope="col"
                                className="w-[34%] px-[22px] py-[18px]"
                            >
                                <span className="sr-only">What you use</span>
                            </th>
                            {plans.map((p) => (
                                <th
                                    key={p.id}
                                    scope="col"
                                    className={cn(
                                        "px-4 py-[18px] text-base font-semibold",
                                        tint(p.featured),
                                    )}
                                >
                                    {p.name}
                                    <div className="text-mk-note font-medium text-muted-foreground">
                                        {p.price}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {usage.rows.map((r, i) =>
                            r.kind === "group" ? (
                                <tr key={`g-${r.label}`}>
                                    <th
                                        scope="rowgroup"
                                        colSpan={plans.length + 1}
                                        className="border-t border-mk-line-soft px-[22px] pb-2 pt-[22px] text-left text-[12.5px] font-semibold uppercase tracking-[0.1em] text-brand-700"
                                    >
                                        {r.label}
                                    </th>
                                </tr>
                            ) : (
                                <tr
                                    key={`l-${i}-${r.label}`}
                                    className="border-t border-mk-line-row"
                                >
                                    <th
                                        scope="row"
                                        className="px-[22px] py-3.5 text-left align-top font-medium text-foreground"
                                    >
                                        {r.label}
                                        {r.what ? (
                                            <span className="mt-0.5 block text-mk-note font-normal text-muted-foreground">
                                                {r.what}
                                            </span>
                                        ) : null}
                                    </th>
                                    {r.cells.map((c, j) => (
                                        <td
                                            key={plans[j]?.id ?? j}
                                            className={cn(
                                                "px-4 py-3.5 align-top text-mk-copy",
                                                tint(
                                                    plans[j]?.featured ?? false,
                                                ),
                                            )}
                                        >
                                            {c === NOT_INCLUDED ? (
                                                <Fragment>
                                                    <span
                                                        aria-hidden
                                                        className="text-mk-on-ink-muted"
                                                    >
                                                        —
                                                    </span>
                                                    <span className="sr-only">
                                                        {c}
                                                    </span>
                                                </Fragment>
                                            ) : (
                                                c
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ),
                        )}
                    </tbody>
                </table>
            </div>
            <ul className="m-0 grid list-disc gap-1.5 pl-5 text-mk-note text-muted-foreground marker:text-mk-on-ink-muted">
                {usage.notes.map((n) => (
                    <li key={n}>{n}</li>
                ))}
            </ul>
        </Container>
    );
}
