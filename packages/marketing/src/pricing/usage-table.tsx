import { Fragment } from "react";

import { Section } from "../sections/section";
import { PlanTable } from "./plan-table";
import type { PlanCardView, UsageView } from "./pricing-model";
import { NOT_INCLUDED } from "./pricing-model";

/**
 * "Usage beyond your plan": the rows a business can add to, by group, one
 * column per plan as in "Compare the plans", each cell what the plan
 * includes and what more costs; the notes under it. The same `PlanTable`,
 * and not drawn at all when nothing can be added.
 */
export function UsageTable({
    plans,
    usage,
    title,
    lead,
}: {
    plans: PlanCardView[];
    usage: UsageView | null;
    title: string;
    lead: string;
}) {
    if (!usage) return null;
    return (
        <Section
            id="usage"
            titleId="usage-title"
            title={title}
            lead={lead}
            size="sm"
            className="grid scroll-mt-6 gap-[18px] pt-[72px]"
        >
            <PlanTable
                label="Usage table"
                caption={title}
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
        </Section>
    );
}
