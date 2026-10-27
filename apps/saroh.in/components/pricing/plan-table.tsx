import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { PlanCardView } from "@/lib/pricing-model";
import { ring } from "@/lib/ring";
import { eyebrowClasses } from "../shared/sections/eyebrow";

interface LineRow {
    kind: "line";
    label: string;
    cells: readonly unknown[];
}

/**
 * A plan table's frame (DEC-195, A20): one column per plan with its price,
 * the featured plan's column tinted, Saffron group rows, and a white frame
 * that scrolls sideways on a phone and is a focusable region so a keyboard
 * can scroll it too. "Compare the plans" and "Usage beyond your plan" pass
 * their rows and draw their own row heads and cells.
 */
export function PlanTable<L extends LineRow>({
    label,
    caption,
    corner,
    plans,
    rows,
    head,
    cell,
    headClassName,
    cellClassName,
}: {
    /** The region's name, for a screen reader. */
    label: string;
    caption?: string;
    /** The first column's (hidden) heading. */
    corner: string;
    plans: PlanCardView[];
    rows: readonly ({ kind: "group"; label: string } | L)[];
    head: (row: L) => ReactNode;
    cell: (cell: L["cells"][number], row: L) => ReactNode;
    headClassName?: string;
    cellClassName?: (
        cell: L["cells"][number],
        row: L,
    ) => string | false | undefined;
}) {
    const tint = (featured: boolean) => (featured ? "bg-mk-tint" : undefined);
    return (
        <div
            role="region"
            aria-label={label}
            tabIndex={0}
            className={`relative min-w-0 overflow-x-auto rounded-[18px] border border-border bg-card ${ring()}`}
        >
            <table className="w-full min-w-[680px] table-fixed border-collapse text-[15px]">
                {caption ? (
                    <caption className="sr-only">{caption}</caption>
                ) : null}
                <thead>
                    <tr className="text-left">
                        <th scope="col" className="w-[34%] px-[22px] py-[18px]">
                            <span className="sr-only">{corner}</span>
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
                                    className={eyebrowClasses({
                                        className:
                                            "border-t border-mk-line-soft px-[22px] pb-2 pt-[22px] text-left",
                                    })}
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
                                    className={cn(
                                        "px-[22px] py-3.5 text-left font-medium text-foreground",
                                        headClassName,
                                    )}
                                >
                                    {head(r)}
                                </th>
                                {r.cells.map((c, j) => (
                                    <td
                                        key={plans[j]?.id ?? j}
                                        className={cn(
                                            "px-4 py-3.5 align-top text-mk-copy",
                                            tint(plans[j]?.featured ?? false),
                                            cellClassName?.(c, r),
                                        )}
                                    >
                                        {cell(c, r)}
                                    </td>
                                ))}
                            </tr>
                        ),
                    )}
                </tbody>
            </table>
        </div>
    );
}
