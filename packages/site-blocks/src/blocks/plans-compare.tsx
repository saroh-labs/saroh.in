import type { RenderedPlans } from "@saroh/block-contract";

import type { PublicPlan } from "../lib/plans-read";
import { cn } from "../lib/utils";

/** A cell's words when the owner typed none: the plan includes the row. */
export const COMPARE_INCLUDED = "Included";

/** A plan with no cell in a row: said, never a dash alone. */
export const COMPARE_NOT_INCLUDED = "Not included";

/** What a plan's column says in one row: its words, or not included. */
export function compareCell(
    row: NonNullable<RenderedPlans["includes"]>[number],
    planId: string,
): { included: boolean; words: string } {
    const cell = row.cells?.find((c) => c.id === planId);
    if (!cell) return { included: false, words: COMPARE_NOT_INCLUDED };
    return {
        included: true,
        words: cell.words?.trim() ? cell.words.trim() : COMPARE_INCLUDED,
    };
}

function Mark({ included }: { included: boolean }) {
    return (
        <svg
            aria-hidden="true"
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={included ? 2.2 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
                "shrink-0",
                included ? "text-site-accent-text" : "text-site-muted",
            )}
        >
            <path d={included ? "M5 12.5l4.5 4.5L19 7.5" : "M6 12h12"} />
        </svg>
    );
}

/**
 * The `compare` look (DEC-228, LBPlans "Compare"): the plans on sale as
 * columns of a table — how often, the "Most chosen" badge on the
 * highlighted one, its name and price — then the owner's typed rows, every
 * cell in words beside a tick or a dash (never the mark alone), and each
 * plan's button under its column. A plan not on sale is not a column, so
 * a row's cell for it is simply not drawn. The highlighted column is
 * tinted. On a phone the table scrolls sideways inside its own region,
 * never the page.
 */
export function PlansCompare({
    content,
    plans,
    highlightFirst,
    eyebrow,
    price,
    badge,
    action,
}: {
    content: RenderedPlans;
    plans: PublicPlan[];
    highlightFirst: boolean;
    eyebrow: (plan: PublicPlan) => string | null;
    /** The price words, with the GST line under them; null for none. */
    price: (plan: PublicPlan) => React.ReactNode;
    /** The badge's words over a highlighted plan; null for none. */
    badge: (plan: PublicPlan, highlighted: boolean) => string | null;
    action: (plan: PublicPlan, highlighted: boolean) => React.ReactNode;
}) {
    const rows = (content.includes ?? []).filter((r) => r.label.trim());
    const tint = (index: number) =>
        highlightFirst && index === 0 ? "bg-site-surface" : undefined;
    const actions = plans.map((plan, i) =>
        action(plan, highlightFirst && i === 0),
    );
    return (
        <div
            role="region"
            aria-label="Compare plans"
            tabIndex={0}
            data-plans-compare=""
            className="focus-visible:ring-site-accent -mx-5 overflow-x-auto px-5 focus-visible:outline-none focus-visible:ring-2 sm:mx-0 sm:px-0"
        >
            <table className="text-site-body w-full min-w-[560px] border-collapse text-left text-[15px] leading-snug">
                <thead>
                    <tr>
                        <th
                            scope="col"
                            className="border-site-fg text-site-muted border-b-[1.5px] px-4 pb-4 align-bottom text-[14px] font-medium"
                        >
                            Includes
                        </th>
                        {plans.map((plan, i) => {
                            const said = badge(plan, highlightFirst && i === 0);
                            return (
                                <th
                                    key={plan.id}
                                    scope="col"
                                    className={cn(
                                        "border-site-fg border-b-[1.5px] px-4 pb-4 pt-3 align-bottom font-normal",
                                        tint(i),
                                    )}
                                >
                                    {said ? (
                                        <span className="bg-site-accent text-site-accent-fg inline-block rounded-full px-2 py-0.5 text-[12px] font-bold">
                                            {said}
                                        </span>
                                    ) : (
                                        <span className="text-site-muted block text-[13px] font-semibold">
                                            {eyebrow(plan)}
                                        </span>
                                    )}
                                    <span className="font-site-heading text-site-fg mb-0.5 mt-1.5 block text-[calc(1.5rem*var(--site-heading-scale))] font-semibold leading-tight">
                                        {plan.name}
                                    </span>
                                    <span className="text-site-fg block text-[16px] font-semibold tabular-nums">
                                        {price(plan)}
                                    </span>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, r) => (
                        <tr key={r}>
                            <th
                                scope="row"
                                className="border-site-border text-site-fg w-[26%] border-b px-4 py-3.5 font-medium"
                            >
                                {row.label}
                            </th>
                            {plans.map((plan, i) => {
                                const cell = compareCell(row, plan.id);
                                return (
                                    <td
                                        key={plan.id}
                                        className={cn(
                                            "border-site-border border-b px-4 py-3.5",
                                            tint(i),
                                        )}
                                    >
                                        <span
                                            data-included={cell.included}
                                            className={cn(
                                                "inline-flex items-center gap-2",
                                                cell.included
                                                    ? "text-site-fg"
                                                    : "text-site-muted",
                                            )}
                                        >
                                            <Mark included={cell.included} />
                                            {cell.words}
                                        </span>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
                {actions.some(Boolean) ? (
                    <tfoot>
                        <tr>
                            <td />
                            {plans.map((plan, i) => (
                                <td
                                    key={plan.id}
                                    className={cn("px-4 pb-4 pt-4", tint(i))}
                                >
                                    {actions[i]}
                                </td>
                            ))}
                        </tr>
                    </tfoot>
                ) : null}
            </table>
        </div>
    );
}
