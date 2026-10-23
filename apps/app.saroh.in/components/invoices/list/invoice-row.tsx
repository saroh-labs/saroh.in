"use client";

import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

import { listTable } from "@/components/shared/lists/list-toolbar";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { formatMoneyMajor } from "@/lib/format/money";
import type { Invoice } from "@/lib/invoices/service";
import {
    billedTo,
    invoicePill,
    sourceLine,
    whenLine,
} from "@/lib/invoices/status";

const money = (amount: string | number, currency: string) =>
    formatMoneyMajor(amount, currency);

/**
 * The list's columns at a desk, after INVListAC: who it is billed to (and
 * what it was for), the invoice's number and day, its standing, the total.
 * The head and every row share them, so they line up.
 */
export const INVOICE_GRID =
    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 md:grid-cols-[minmax(0,2fr)_minmax(120px,1fr)_minmax(0,1.6fr)_96px]";

/**
 * The number's last part, which is what tells two apart in one series:
 * "0106" for "RC/26-27/0106". The phone's row says this; the whole number
 * is on the desk and in the details.
 */
export function shortNumber(number: string | null): string {
    if (!number) return "Draft";
    const tail = number.split("/").at(-1)?.trim();
    return tail && tail.length > 0 ? tail : number;
}

/**
 * One row of the Invoices list (DEC-173, U8 #1120). The whole row opens
 * the invoice (`onOpen`): today the quick look, and the details side
 * sheet once U9 lands, through the screen's one `openInvoice`.
 *
 * - **At a desk**, the board's columns: who and what it was for, the
 *   number and day, the pill and the when line, the total.
 * - **On a phone**, a card 64 to 72px tall (the audit's 130px rows were
 *   the cramped phone): who, then "0106 · 13 days late", and the total,
 *   red while it is late. What it was for is still said to a screen
 *   reader.
 *
 * A correction sits indented under the invoice it corrects. `after` is a
 * slot beside the row for its own action (the per-row Remind, U12), and
 * `before` one for its tick when rows are picked (U12, desk only); both
 * sit outside the button so each is a control of its own.
 */
export function InvoiceRow({
    invoice: i,
    selected,
    onOpen,
    timeZone,
    before,
    after,
}: {
    /**
     * The business's zone, which the invoice's dates are written in
     * (#836), as on the paper the customer gets. Absent, the viewer's.
     */
    timeZone?: string;
    invoice: Invoice;
    selected: boolean;
    onOpen: () => void;
    before?: ReactNode;
    after?: ReactNode;
}) {
    const pill = invoicePill(i);
    const when = whenLine(i);
    const credit = i.kind === "CREDIT_NOTE";
    const nested = credit || i.kind === "SUPPLEMENTARY";
    const who = billedTo(i).name;
    const total = `${credit ? "−" : ""}${money(i.total, i.currency)}`;
    const whenWords = (
        <>
            {when.before}
            {when.date ? (
                <ViewerDate
                    iso={when.date}
                    variant="dayMonth"
                    timeZone={timeZone}
                />
            ) : null}
            {when.after}
        </>
    );
    const button = (
        <button
            type="button"
            aria-haspopup="dialog"
            data-invoice-row={i.id}
            onClick={onOpen}
            className={cn(
                "w-full text-left",
                INVOICE_GRID,
                listTable.rowInner,
                listTable.pressable,
                // The phone's card: 64px at least, two lines that never
                // wrap, so it stays under 72.
                "max-md:min-h-16 max-md:px-3 max-md:py-2",
                selected && listTable.selected,
            )}
        >
            {/* Who, and what it was for. A correction is indented under
                its invoice, inside the first column, so every column
                still lines up. */}
            <span className={cn("min-w-0", nested && "pl-6")}>
                <span className="block truncate text-[14.5px] font-semibold text-foreground md:text-[14px]">
                    {who}
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground max-md:hidden md:text-[12px]">
                    {sourceLine(i)}
                </span>
                {/* The phone's second line: which one, and how it stands. */}
                <span
                    className={cn(
                        "mt-px block truncate text-[12.5px] md:hidden",
                        when.late
                            ? "text-destructive-subtle-foreground"
                            : "text-muted-foreground",
                    )}
                >
                    {/* The tail for the eye; the whole number for a screen
                        reader, and for whoever finds the row by it. */}
                    <span aria-hidden className="font-mono">
                        {shortNumber(i.number)}
                    </span>
                    <span className="sr-only">{i.number ?? "Draft"}</span>
                    {" · "}
                    {phoneStanding(i, pill.label, when.late, whenWords)}
                    <span className="sr-only">, {sourceLine(i)}</span>
                </span>
            </span>
            <span className="min-w-0 max-md:hidden">
                <span className="block font-mono text-[12.5px] font-medium text-foreground">
                    {i.number ?? "Draft"}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {i.issuedAt ? (
                        <ViewerDate
                            iso={i.issuedAt}
                            variant="dayMonth"
                            timeZone={timeZone}
                        />
                    ) : (
                        "Not issued yet"
                    )}
                </span>
            </span>
            <span className="min-w-0 max-md:hidden">
                <StatusBadge tone={pill.variant}>{pill.label}</StatusBadge>
                <span
                    className={cn(
                        "mt-[3px] block text-[12px]",
                        when.late
                            ? "text-destructive-subtle-foreground"
                            : "text-muted-foreground",
                    )}
                >
                    {whenWords}
                </span>
            </span>
            <span
                className={cn(
                    "whitespace-nowrap text-right font-display text-[14px] font-semibold tabular-nums",
                    when.late
                        ? "max-md:text-destructive-subtle-foreground md:text-foreground"
                        : "text-foreground",
                )}
            >
                {total}
            </span>
        </button>
    );
    if (!after && !before) return button;
    return (
        <div className="flex min-w-0 items-center">
            {before ? (
                <div className="flex w-[38px] shrink-0 items-center pl-[14px] max-md:hidden">
                    {before}
                </div>
            ) : null}
            <div className="min-w-0 flex-1">{button}</div>
            {after ? (
                <div className="flex shrink-0 items-center gap-1.5 md:pr-3">
                    {after}
                </div>
            ) : null}
        </div>
    );
}

/**
 * The phone's standing words: "13 days late" while late, "Due 22 Sep",
 * "Paid 18 Sep", "Not issued yet" for a draft, or the pill's own word
 * ("Partly paid", "Void", "Credit note").
 */
function phoneStanding(
    i: Invoice,
    pill: string,
    late: boolean,
    when: ReactNode,
): ReactNode {
    if (late) return when;
    if (i.kind === "CREDIT_NOTE") return pill;
    // "Draft" is already where the number would be.
    if (i.standing === "DRAFT") return "Not issued yet";
    if (i.partlyPaid || i.chequeWaiting) return pill;
    if (i.standing === "ISSUED" || i.standing === "PAID") return when;
    return pill;
}
