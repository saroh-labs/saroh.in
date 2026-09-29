"use client";

import { cn } from "@saroh/ui/lib/utils";

import { InvoicePill } from "@/components/invoices/invoice-pill";
import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import type { Invoice } from "@/lib/invoices/service";
import {
    billedTo,
    invoicePill,
    sourceLine,
    whenLine,
} from "@/lib/invoices/status";

const money = (amount: string | number, currency: string) =>
    formatMoneyMajor(amount, currency) ?? String(amount);

/**
 * One row of the Invoices list, after the design: number and when it was
 * issued, who it is billed to and what it was for, its standing, and the
 * total. The whole row opens the quick look. A correction sits indented
 * under the invoice it corrects.
 */
export function InvoiceRow({
    invoice: i,
    selected,
    onOpen,
}: {
    invoice: Invoice;
    selected: boolean;
    onOpen: () => void;
}) {
    const pill = invoicePill(i);
    const when = whenLine(i);
    const credit = i.kind === "CREDIT_NOTE";
    const nested = credit || i.kind === "SUPPLEMENTARY";
    return (
        <button
            type="button"
            aria-haspopup="dialog"
            onClick={onOpen}
            className={cn(
                "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 rounded-[11px] border border-border px-3.5 py-3 text-left transition-colors duration-fast hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:border-border-strong active:bg-accent md:grid-cols-[minmax(120px,1fr)_minmax(0,2fr)_minmax(0,1.6fr)_96px]",
                selected
                    ? "bg-brand-subtle shadow-[inset_3px_0_0_hsl(var(--highlight))]"
                    : "bg-card",
                nested && "md:ml-6 md:w-[calc(100%-1.5rem)]",
            )}
        >
            <span className="min-w-0">
                <span className="block font-mono text-[12.5px] font-medium text-foreground">
                    {i.number ?? "Draft"}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {i.issuedAt ? (
                        <ViewerDate iso={i.issuedAt} variant="dayMonth" />
                    ) : (
                        "Not issued yet"
                    )}
                </span>
            </span>
            <span className="min-w-0 text-right md:text-left">
                <span className="block truncate text-[14px] font-semibold text-foreground">
                    {billedTo(i).name}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                    {sourceLine(i)}
                </span>
            </span>
            <span className="min-w-0">
                <InvoicePill label={pill.label} variant={pill.variant} />
                <span
                    className={cn(
                        "mt-[3px] block text-[12px]",
                        when.late
                            ? "text-destructive-subtle-foreground"
                            : "text-muted-foreground",
                    )}
                >
                    {when.before}
                    {when.date ? (
                        <ViewerDate iso={when.date} variant="dayMonth" />
                    ) : null}
                    {when.after}
                </span>
            </span>
            <span className="text-right font-display text-[14px] font-semibold tabular-nums text-foreground">
                {credit ? "−" : ""}
                {money(i.total, i.currency)}
            </span>
        </button>
    );
}
