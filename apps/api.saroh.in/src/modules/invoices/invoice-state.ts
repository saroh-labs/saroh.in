/**
 * What an invoice is, as the merchant reads it.
 *
 * Only DRAFT, ISSUED, PAID, VOID and CREDITED are stored. "Overdue" is
 * derived — issued and past its due date — so it can never drift from the
 * dates (ADR-007). The views never overlap: Issued means issued and not yet
 * due, Overdue means issued and past due.
 *
 * CREDITED (ADR-008): an issued invoice a credit note cancelled in full. A
 * GST-registered business never voids an issued invoice; it credits it, and
 * the invoice keeps its number and its lines.
 */
export const INVOICE_STATUSES = [
    "DRAFT",
    "ISSUED",
    "PAID",
    "VOID",
    "CREDITED",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * What a document is (ADR-008): an invoice, a credit note (a correction
 * down) or a supplementary invoice (a correction up). Corrections point at
 * the invoice they correct and never change it.
 */
export const INVOICE_KINDS = [
    "INVOICE",
    "CREDIT_NOTE",
    "SUPPLEMENTARY",
] as const;
export type InvoiceKindValue = (typeof INVOICE_KINDS)[number];

export const INVOICE_VIEWS = [
    "draft",
    "issued",
    "overdue",
    "paid",
    "void",
] as const;
export type InvoiceView = (typeof INVOICE_VIEWS)[number];

export type InvoiceStanding =
    "DRAFT" | "ISSUED" | "OVERDUE" | "PAID" | "VOID" | "CREDITED";

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
    // ADR-008: an order's invoice and its corrections, and a paid online
    // booking's invoice. Neither has a pay link of its own.
    "ORDER",
    "BOOKING",
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

/**
 * An order's own paper (its invoice and the corrections to it) and credit
 * notes are never owed, nor spent: the order is where that money is counted
 * (ADR-008). Every sum of owed or spent over invoices spreads this into its
 * `where` — one that forgets it counts a rupee twice.
 */
export const OWED_WHERE = {
    orderId: null,
    kind: { not: "CREDIT_NOTE" },
} as const;

/** The `where` for one list view. `now` splits Issued from Overdue. */
export function viewWhere(
    view: InvoiceView,
    now: Date,
): {
    status: InvoiceStatus;
    OR?: object[];
    dueAt?: object;
    kind?: object;
} {
    switch (view) {
        case "draft":
            return { status: "DRAFT" };
        case "issued":
            // A credit note is issued paper but nothing is due on it.
            return {
                status: "ISSUED",
                kind: { not: "CREDIT_NOTE" },
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
