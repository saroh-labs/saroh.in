"use client";

import { Check } from "lucide-react";
import { Fragment, useState } from "react";

import { Pill } from "../links/pill";
import { Section } from "../sections/section";
import { PlanTable } from "./plan-table";
import type { CompareRow, PlanCardView } from "./pricing-model";
import { SegmentPairs } from "./segment-pairs";

/**
 * "Compare the plans": the catalogue's modules by group in a `PlanTable`,
 * a tick and its words in each plan's cell, "Coming soon" pills, and on the
 * staff preview what the draft changed.
 */
export function CompareTable({
    plans,
    rows,
    placeholder,
    placeholderNote,
}: {
    plans: PlanCardView[];
    rows: CompareRow[];
    /** No catalogue: every cell says the details are still to come. */
    placeholder: boolean;
    /** What a screen reader hears for such a cell. */
    placeholderNote: string;
}) {
    // A phone compares two plans side by side (the boards' pair switch);
    // it starts on the highlighted plan and the one after it.
    const featured = Math.max(
        0,
        plans.findIndex((p) => p.featured),
    );
    const [pair, setPair] = useState(
        Math.max(1, Math.min(featured + 1, plans.length - 1)),
    );
    const pairs = plans.slice(1).map((p, i) => `${plans[i].name} vs ${p.name}`);
    return (
        <Section
            titleId="compare-title"
            title="Compare the plans"
            lead="Words here match the cards."
            size="kit-h2"
            className="grid gap-6 pt-[72px] min-[760px]:pt-[120px]"
        >
            {pairs.length > 1 ? (
                <SegmentPairs
                    label="Plans to compare"
                    items={pairs}
                    chosen={pair - 1}
                    onChoose={(i) => setPair(i + 1)}
                />
            ) : null}
            <PlanTable
                phoneShows={plans.length > 2 ? [pair - 1, pair] : undefined}
                label="Plan comparison table"
                corner="Feature"
                plans={plans}
                rows={rows}
                head={(r) => (
                    <>
                        {r.label}
                        {r.soon ? (
                            <Pill tone="soon" className="ml-2">
                                Coming soon
                            </Pill>
                        ) : null}
                        {r.what ? (
                            <span className="mt-0.5 block text-[13.5px] font-normal text-muted-foreground">
                                {r.what}
                            </span>
                        ) : null}
                    </>
                )}
                cellClassName={(c, r) =>
                    (c.was !== undefined || r.added) &&
                    "shadow-[inset_3px_0_0_hsl(var(--brand-500))]"
                }
                cell={(c, r) => (
                    <>
                        {c.yes && c.t !== "Included" ? (
                            c.t
                        ) : c.yes ? (
                            <span className="inline-flex items-start gap-1.5 text-foreground">
                                <Check
                                    aria-hidden
                                    strokeWidth={2.4}
                                    className="mt-[3px] size-4 shrink-0 text-mk-ok"
                                />
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
                                        ? placeholderNote
                                        : "Not included"}
                                </span>
                            </Fragment>
                        )}
                        {c.was !== undefined ? (
                            <span className="block text-[12.5px] font-semibold text-brand-700">
                                was {c.was}
                            </span>
                        ) : r.added ? (
                            <span className="block text-[12.5px] font-semibold text-brand-700">
                                New in the draft
                            </span>
                        ) : null}
                    </>
                )}
            />
        </Section>
    );
}
