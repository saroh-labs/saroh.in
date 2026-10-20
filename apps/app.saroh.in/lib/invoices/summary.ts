import { formatMoney, formatNumber } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

import type {
    InvoiceSummary,
    SummaryFigure,
    SummaryFilter,
    SummaryTotal,
} from "./summary-types";
import { chequesWaitingLine } from "./words";

/**
 * The Invoices money strip (DEC-173, U8 #1120): `GET invoices/summary`
 * (U4 #1116) as the app reads it, and the words each figure says. Pure:
 * no clock, no React, no server.
 *
 * Every figure carries the list filter it stands for (`filter`), worked out
 * by the API, so the app never builds one. Without `payment:read` the API
 * sends counts and no `totals` (DEC-098), and the strip says counts only.
 */

export type {
    InvoiceSummary,
    SummaryFigure,
    SummaryFilter,
    SummaryTotal,
} from "./summary-types";

/** The strip's four figures, in the board's order. */
export type FigureKey = "owed" | "overdue" | "paid" | "drafts";

export interface FigureView {
    key: FigureKey;
    /** "Owed to you", "Overdue", "Paid in October", "Drafts". */
    label: string;
    /** "₹32,970", or the count when the role sees no money. */
    value: string;
    /** "18 invoices", "1 draft"; "invoices" under a bare count. */
    sub: string;
    /** Overdue with something in it is late: its figure reads so. */
    late: boolean;
    filter: SummaryFilter;
}

/** "₹35,400", or "₹35,400 + $120" for a business billing in two currencies. */
export function totalsWords(
    totals: readonly SummaryTotal[] | undefined,
): string {
    const some = (totals ?? []).filter((t) => t.amountMinor !== 0);
    if (some.length === 0)
        return formatMoney(0, totals?.[0]?.currency ?? "INR");
    return some.map((t) => formatMoney(t.amountMinor, t.currency)).join(" + ");
}

const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
] as const;

/** "October", from the month's first day, `2026-10-01`. */
export function monthName(monthStart: string): string {
    const month = Number(monthStart.slice(5, 7));
    return MONTHS[month - 1] ?? "this month";
}

function figure(
    key: FigureKey,
    label: string,
    f: SummaryFigure,
    money: boolean,
    noun: { one: string; other: string },
): FigureView {
    const late = key === "overdue" && f.count > 0;
    if (!money) {
        // Counts only (DEC-098): the number is the figure, never "₹0".
        return {
            key,
            label,
            value: formatNumber(f.count),
            sub: f.count === 1 ? noun.one : noun.other,
            late,
            filter: f.filter,
        };
    }
    return {
        key,
        label,
        value: totalsWords(f.totals),
        sub: f.count === 0 ? "None" : count(f.count, noun.one, noun.other),
        late,
        filter: f.filter,
    };
}

const INVOICES = { one: "invoice", other: "invoices" };

/** Owed to you, Overdue, Paid in ‹month›, Drafts: what the strip draws. */
export function stripFigures(s: InvoiceSummary): FigureView[] {
    return [
        figure("owed", "Owed to you", s.owed, s.money, INVOICES),
        figure("overdue", "Overdue", s.overdue, s.money, INVOICES),
        figure(
            "paid",
            `Paid in ${monthName(s.monthStart)}`,
            s.paidThisMonth,
            s.money,
            INVOICES,
        ),
        figure("drafts", "Drafts", s.drafts, s.money, {
            one: "draft",
            other: "drafts",
        }),
    ];
}

/**
 * "Cheques not in the bank · 2 · ₹14,000" under the strip, or
 * "Cheques not in the bank · 2" without money. Null while none waits.
 */
export function chequesLine(s: InvoiceSummary): string | null {
    const c = s.chequesWaiting;
    if (!c || c.count === 0) return null;
    if (!s.money || !c.totals) {
        return `Cheques not in the bank · ${formatNumber(c.count)}`;
    }
    return chequesWaitingLine(c.count, totalsWords(c.totals));
}
