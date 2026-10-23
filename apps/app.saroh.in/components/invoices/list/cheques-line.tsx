"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Landmark } from "lucide-react";

import type { InvoiceSummary, SummaryFilter } from "@/lib/invoices/summary";
import { chequesLine } from "@/lib/invoices/summary";

/**
 * "Cheques not in the bank · 2 · ₹14,000" (DEC-173, R8, U8 #1120): one
 * line under the money strip, drawn only while a cheque waits. Pressed,
 * the list shows the invoices whose cheque hasn't cleared
 * (`?view=cheques`, the address Home's line opens too); pressed again, the
 * whole list. Marking a cheque in the bank or bounced is on the invoice.
 * Without money the line is a count.
 */
export function ChequesLine({
    summary,
    on,
    onPick,
    className,
}: {
    summary: InvoiceSummary | null;
    /** The list is showing the cheques now. */
    on: boolean;
    onPick: (filter: SummaryFilter | null) => void;
    className?: string;
}) {
    const line = summary ? chequesLine(summary) : null;
    const filter = summary?.chequesWaiting?.filter;
    if (!line || !filter) return null;
    return (
        <button
            type="button"
            data-cheques-line=""
            aria-pressed={on}
            onClick={() => onPick(on ? null : filter)}
            className={cn(
                "flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-left text-[13.5px] font-semibold text-foreground transition-colors duration-fast hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-muted sm:w-auto",
                on
                    ? "border-2 border-foreground px-[11px] py-[7px]"
                    : "border-border",
                className,
            )}
        >
            <Landmark
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
            />
            <span data-ph-mask="" className="min-w-0 [overflow-wrap:anywhere]">
                {line}
            </span>
        </button>
    );
}
