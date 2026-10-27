import { Fragment } from "react";

import { PRICING_COPY } from "@/content/pricing";
import type { PlanCardView, UsageView } from "@/lib/pricing-model";
import { NOT_INCLUDED } from "@/lib/pricing-model";

import { Container } from "../shared/layout/container";
import { PlanTable } from "./plan-table";

/**
 * "Usage beyond your plan": the rows a business can add to, by group, one
 * column per plan as in "Compare the plans", each cell what the plan
 * includes and what more costs; the notes under it. The same `PlanTable`,
 * and not drawn at all when nothing can be added.
 */
export function UsageTable({
    plans,
    usage,
}: {
    plans: PlanCardView[];
    usage: UsageView | null;
}) {
    if (!usage) return null;
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
            <PlanTable
                label="Usage table"
                caption={PRICING_COPY.usageTitle}
                corner="What you use"
                plans={plans}
                rows={usage.rows}
                headClassName="align-top"
                head={(r) => (
                    <>
                        {r.label}
                        {r.what ? (
                            <span className="mt-0.5 block text-mk-note font-normal text-muted-foreground">
                                {r.what}
                            </span>
                        ) : null}
                    </>
                )}
                cell={(c) =>
                    c === NOT_INCLUDED ? (
                        <Fragment>
                            <span aria-hidden className="text-mk-on-ink-muted">
                                —
                            </span>
                            <span className="sr-only">{c}</span>
                        </Fragment>
                    ) : (
                        c
                    )
                }
            />
            <ul className="m-0 grid list-disc gap-1.5 pl-5 text-mk-note text-muted-foreground marker:text-mk-on-ink-muted">
                {usage.notes.map((n) => (
                    <li key={n}>{n}</li>
                ))}
            </ul>
        </Container>
    );
}
