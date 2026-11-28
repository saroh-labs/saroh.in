import type { ReactNode } from "react";

import { cn } from "../cn";
import { ring } from "../ring";
import { eyebrowClasses } from "../sections/eyebrow";
import type { PlanCardView } from "./pricing-model";

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
    phoneShows,
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
    /**
     * On a phone, only these plans' columns (by index): the rest stay in
     * the page, hidden below 760px, and the table fits the screen.
     */
    phoneShows?: readonly number[];
}) {
    const tint = (featured: boolean) => (featured ? "bg-mk-tint" : undefined);
    const off = (j: number) =>
        phoneShows && !phoneShows.includes(j) && "max-[759px]:hidden";
    return (
        <div
            role="region"
            aria-label={label}
            tabIndex={0}
            className={`relative min-w-0 overflow-x-auto rounded-[18px] border border-border bg-card ${ring()}`}
        >
            <table
                className={cn(
                    "w-full table-fixed border-collapse text-[15px] max-[759px]:text-[14.5px]",
                    phoneShows ? "min-[760px]:min-w-[680px]" : "min-w-[680px]",
                )}
            >
                {caption ? (
                    <caption className="sr-only">{caption}</caption>
                ) : null}
                <thead>
                    <tr className="text-left">
                        <th
                            scope="col"
                            className="w-[40%] px-3.5 py-[18px] min-[760px]:w-[30%] min-[760px]:px-[22px]"
                        >
                            <span className="sr-only">{corner}</span>
                        </th>
                        {plans.map((p, j) => (
                            <th
                                key={p.id}
                                scope="col"
                                className={cn(
                                    "px-2.5 py-[18px] align-top text-base font-semibold min-[760px]:px-4",
                                    tint(p.featured),
                                    off(j),
                                )}
                            >
                                {p.name}
                                <div className="text-mk-note font-medium text-muted-foreground">
                                    {p.price}
                                    {p.was ? (
                                        <>
                                            {" "}
                                            <s>
                                                <span className="sr-only">
                                                    regular price{" "}
                                                </span>
                                                {p.was}
                                            </s>
                                        </>
                                    ) : null}
                                    {p.per ? ` ${p.per}` : null}
                                </div>
                                {p.then ? (
                                    <div className="text-[13px] font-semibold text-brand-700">
                                        {p.then}
                                    </div>
                                ) : null}
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
                                    colSpan={phoneShows ? 3 : plans.length + 1}
                                    className={eyebrowClasses({
                                        className:
                                            "border-t border-mk-line-soft px-3.5 pb-2 pt-5 text-left min-[760px]:px-[22px] min-[760px]:pt-[26px]",
                                    })}
                                >
                                    {r.label}
                                </th>
                                {/* The desk's other columns; a phone's row spans its two plans. */}
                                {phoneShows && plans.length > 2 ? (
                                    <td
                                        colSpan={plans.length - 2}
                                        className="border-t border-mk-line-soft max-[759px]:hidden"
                                    />
                                ) : null}
                            </tr>
                        ) : (
                            <tr
                                key={`l-${i}-${r.label}`}
                                className="border-t border-mk-line-row"
                            >
                                <th
                                    scope="row"
                                    className={cn(
                                        "px-3.5 py-3 text-left font-medium text-foreground min-[760px]:px-[22px] min-[760px]:py-3.5",
                                        headClassName,
                                    )}
                                >
                                    {head(r)}
                                </th>
                                {r.cells.map((c, j) => (
                                    <td
                                        key={plans[j]?.id ?? j}
                                        className={cn(
                                            "px-2.5 py-3 align-top text-mk-copy [overflow-wrap:anywhere] min-[760px]:px-4 min-[760px]:py-3.5",
                                            tint(plans[j]?.featured ?? false),
                                            cellClassName?.(c, r),
                                            off(j),
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
