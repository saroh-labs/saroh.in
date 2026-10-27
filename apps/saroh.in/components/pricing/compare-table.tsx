import { Fragment } from "react";

import { PRICE_NOTE } from "@/content/types";
import type { CompareRow, PlanCardView } from "@/lib/pricing-model";

import { Container } from "../shared/layout/container";
import { Pill } from "../shared/links/pill";
import { PlanTable } from "./plan-table";

/**
 * "Compare the plans": the catalogue's modules by group in a `PlanTable`,
 * a tick and its words in each plan's cell, "Coming soon" pills, and on the
 * staff preview what the draft changed.
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
            <PlanTable
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
                    </>
                )}
                cellClassName={(c, r) =>
                    (c.was !== undefined || r.added) &&
                    "shadow-[inset_3px_0_0_hsl(var(--brand-500))]"
                }
                cell={(c, r) => (
                    <>
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
                                    {placeholder ? PRICE_NOTE : "Not included"}
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
        </Container>
    );
}
