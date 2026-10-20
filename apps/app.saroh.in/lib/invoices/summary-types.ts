/**
 * `GET invoices/summary` as the app reads it (DEC-173, U4 #1116): the
 * shapes alone, so `service.ts` can name them without reaching the words
 * (`summary.ts`) that read `service.ts`'s own types.
 */

/** An amount in one currency, in minor units. */
export interface SummaryTotal {
    currency: string;
    amountMinor: number;
}

/** The list filter a figure stands for, as the list's query takes it. */
export interface SummaryFilter {
    view?: "owed" | "overdue" | "draft" | "cheques";
    /** A day in the business's zone, `2026-10-01`. */
    paidFrom?: string;
}

export interface SummaryFigure {
    count: number;
    /** Per currency; absent for a role without `payment:read`. */
    totals?: SummaryTotal[];
    filter: SummaryFilter;
}

export interface InvoiceSummary {
    zone: string;
    /** The 1st of this month in the business's zone, `2026-10-01`. */
    monthStart: string;
    /** Whether the figures carry amounts (`payment:read`). */
    money: boolean;
    owed: SummaryFigure;
    overdue: SummaryFigure;
    paidThisMonth: SummaryFigure;
    drafts: SummaryFigure;
    /** Null while no cheque waits: the line is drawn only then. */
    chequesWaiting: SummaryFigure | null;
}
