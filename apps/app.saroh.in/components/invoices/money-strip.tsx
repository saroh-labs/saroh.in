"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ScrollX } from "@saroh/ui/scroll-x";

import { FailedRead } from "@/components/shared/failed-read";
import type { ListQuery } from "@/lib/invoices/list-view";
import { figureOn } from "@/lib/invoices/list-view";
import type {
    FigureView,
    InvoiceSummary,
    SummaryFilter,
} from "@/lib/invoices/summary";
import { stripFigures } from "@/lib/invoices/summary";

/**
 * The Invoices money strip (DEC-173, U8 #1120, INVListAC): Owed to you,
 * Overdue, Paid in ‹month› and Drafts, each with its label, its amount
 * and how many. Each figure is the filter it names: pressed, the list
 * shows those invoices and the figure reads as on (`aria-pressed`);
 * pressed again, the list shows everything. It says once what the old
 * header's "₹X owed · N overdue" and the red overdue banner said twice.
 *
 * - A role without `payment:read` sees counts and no amounts (DEC-098).
 * - A summary that couldn't be read says "Couldn't load totals" with Try
 *   again, never a row of ₹0; the list below still loads.
 * - On a phone the four sit in a row that scrolls sideways (`ScrollX`),
 *   two in view, so none is hidden off the edge without a sign.
 *
 * The figures are the business's, so they stay masked in a recording;
 * only the labels are readable (DEC-125).
 */
export function MoneyStrip({
    summary,
    query,
    onPick,
    className,
}: {
    /** Null when the summary couldn't be read. */
    summary: InvoiceSummary | null;
    query: ListQuery;
    /** A figure's filter, or null to show every invoice again. */
    onPick: (filter: SummaryFilter | null) => void;
    className?: string;
}) {
    if (!summary) {
        return (
            <FailedRead
                things="totals"
                reassurance="The invoices below are all there."
                className={className}
            />
        );
    }
    const figures = stripFigures(summary);
    return (
        <ScrollX label="Money owed and paid" bare className={className}>
            <ul
                aria-label="Money owed and paid"
                data-money-strip=""
                className="grid auto-cols-[minmax(148px,46%)] grid-flow-col gap-2.5 p-0.5 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 lg:grid-cols-4"
            >
                {figures.map((f) => {
                    const on = figureOn(query, f.key, f.filter);
                    return (
                        <li key={f.key} className="min-w-0">
                            <Figure
                                figure={f}
                                on={on}
                                onPress={() => onPick(on ? null : f.filter)}
                            />
                        </li>
                    );
                })}
            </ul>
        </ScrollX>
    );
}

function Figure({
    figure: f,
    on,
    onPress,
}: {
    figure: FigureView;
    on: boolean;
    onPress: () => void;
}) {
    return (
        <button
            type="button"
            data-figure={f.key}
            aria-pressed={on}
            onClick={onPress}
            className={cn(
                "flex h-full w-full min-w-0 flex-col gap-[3px] rounded-xl border bg-card px-3.5 py-3 text-left text-foreground transition-colors duration-fast hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-muted max-sm:px-3 max-sm:py-2.5",
                // On: an Ink edge twice as thick, the shape saying it as
                // well as the colour (§19).
                on
                    ? "border-2 border-foreground px-[13px] py-[11px] max-sm:px-[11px] max-sm:py-[9px]"
                    : "border-border",
            )}
        >
            <span
                data-ph-unmask=""
                className="text-[12px] font-medium text-muted-foreground"
            >
                {f.label}
            </span>
            <span
                data-ph-mask=""
                className={cn(
                    "font-display text-[22px] font-semibold tabular-nums leading-tight tracking-[-0.02em] [overflow-wrap:anywhere] max-sm:text-[19px]",
                    f.late && "text-destructive-subtle-foreground",
                )}
            >
                {f.value}
            </span>
            <span data-ph-mask="" className="text-[12px] text-muted-foreground">
                {f.sub}
            </span>
        </button>
    );
}
