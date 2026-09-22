/**
 * What an invoice is, as the merchant reads it.
 *
 * Only DRAFT, ISSUED, PAID and VOID are stored. "Overdue" is derived — issued
 * and past its due date — so it can never drift from the dates (ADR-007). The
 * views never overlap: Issued means issued and not yet due, Overdue means
 * issued and past due.
 */
export const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PAID", "VOID"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_VIEWS = [
    "draft",
    "issued",
    "overdue",
    "paid",
    "void",
] as const;
export type InvoiceView = (typeof INVOICE_VIEWS)[number];

export type InvoiceStanding = "DRAFT" | "ISSUED" | "OVERDUE" | "PAID" | "VOID";

export const PAYMENT_METHODS = [
    "CASH",
    "UPI",
    "BANK_TRANSFER",
    "CARD",
    "OTHER",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * How an invoice paid through its pay link (U13) is recorded. Written only by
 * the payment webhook — never offered when a payment is recorded by hand, so
 * it is not one of {@link PAYMENT_METHODS}.
 */
export const ONLINE_PAYMENT_METHOD = "ONLINE";

/**
 * The attempt the webhook writes when money arrives for an invoice that was
 * already paid or void: captured, not applied, owed back (U13).
 */
export const CAPTURED_NEEDS_REFUND = "CAPTURED_NEEDS_REFUND";

export const INVOICE_SOURCES = [
    "MANUAL",
    "SUBSCRIPTION",
    "COURSE",
    "PACK",
] as const;
export type InvoiceSource = (typeof INVOICE_SOURCES)[number];

/** Issued invoices fall due this many days after issue unless told otherwise. */
export const DEFAULT_DUE_DAYS = 7;

/**
 * Issued and past its due date: the one rule for "overdue", used by the
 * invoice's standing, the owed sums, and a subscription's overdue badge.
 */
export function isPastDue(
    row: { status: string; dueAt: Date | null },
    now: Date,
): boolean {
    return row.status === "ISSUED" && row.dueAt !== null && row.dueAt < now;
}

export function invoiceStanding(
    row: { status: string; dueAt: Date | null },
    now: Date,
): InvoiceStanding {
    return isPastDue(row, now) ? "OVERDUE" : (row.status as InvoiceStanding);
}

/** The `where` for one list view. `now` splits Issued from Overdue. */
export function viewWhere(
    view: InvoiceView,
    now: Date,
): { status: InvoiceStatus; OR?: object[]; dueAt?: object } {
    switch (view) {
        case "draft":
            return { status: "DRAFT" };
        case "issued":
            return {
                status: "ISSUED",
                OR: [{ dueAt: null }, { dueAt: { gte: now } }],
            };
        case "overdue":
            return { status: "ISSUED", dueAt: { lt: now } };
        case "paid":
            return { status: "PAID" };
        case "void":
            return { status: "VOID" };
    }
}
