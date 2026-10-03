import { Fragment } from "react";

import { PRICE_NOTE } from "@/content/types";
import { cn } from "@/lib/cn";
import type { CompareRow, PlanCardView } from "@/lib/pricing-model";

import { Container } from "../container";

/**
 * "Compare the plans": the catalogue's modules by group, one column per
 * plan, the highlighted plan's column tinted, "Coming soon" pills. On a
 * phone the table keeps its width and the white frame scrolls sideways; the
 * frame is a focusable region so a keyboard can scroll it too.
 */
export function CompareTable({
    plans,
    rows,
    placeholder,
}: {
    plans: PlanCardView[];
    rows: CompareRow[];
    /** No catalogue: every cell says the details are still to come. */
    placeholder: boolean;
}) {
    const tint = (featured: boolean) => (featured ? "bg-mk-tint" : undefined);
    return (
        <Container
            as="section"
            aria-labelledby="compare-title"
            className="grid gap-[22px] pt-[110px]"
        >
            <h2
                id="compare-title"
                className="m-0 font-display text-mk-h2-sm font-bold"
            >
                Compare the plans
            </h2>
            <div
                role="region"
                aria-label="Plan comparison table"
                tabIndex={0}
                className="relative min-w-0 overflow-x-auto rounded-[18px] border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
            >
                <table className="w-full min-w-[680px] border-collapse text-[15px]">
                    <thead>
                        <tr className="text-left">
                            <th
                                scope="col"
                                className="w-[34%] px-[22px] py-[18px]"
                            >
                                <span className="sr-only">Feature</span>
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
                        {rows.map((r, i) =>
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
                                        className="px-[22px] py-3.5 text-left font-medium text-foreground"
                                    >
                                        {r.label}
                                        {r.soon ? (
                                            <span className="ml-2 whitespace-nowrap rounded-full bg-mk-soon px-2 py-0.5 text-[11.5px] font-semibold text-brand-700">
                                                Coming soon
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
                                            {c.yes ? (
                                                <span className="inline-flex items-baseline gap-2">
                                                    <span
                                                        aria-hidden
                                                        className="font-bold text-brand-500"
                                                    >
                                                        ✓
                                                    </span>
                                                    {c.t}
                                                </span>
                                            ) : (
                                                <Fragment>
                                                    <span
                                                        aria-hidden
                                                        className="text-mk-on-ink-muted"
                                                    >
                                                        —
                                                    </span>
                                                    <span className="sr-only">
                                                        {placeholder
                                                            ? PRICE_NOTE
                                                            : "Not included"}
                                                    </span>
                                                </Fragment>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ),
                        )}
                    </tbody>
                </table>
            </div>
        </Container>
    );
}
