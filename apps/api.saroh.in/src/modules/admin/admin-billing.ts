import type { Prisma } from "@saroh/database";

import { paiseToRupees } from "../billing/saroh-invoice-terms";
import { stateName } from "../invoices/gst-states";

/**
 * The pure rules behind Admin › Billing (DEC-179): which month an invoice
 * falls in, the month's GST export, and what the subscriptions add up to.
 * No database here, so each rule is tested on its own.
 */

/** India Standard Time is UTC+05:30 all year (no daylight saving). */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * A calendar month in India ("2026-10") as the instants it runs between:
 * from midnight IST on the 1st up to, not including, midnight IST on the
 * next month's 1st. Null for anything that is not a month.
 */
export function istMonthRange(
    month: string | undefined,
): { from: Date; to: Date } | null {
    const match = month ? MONTH.exec(month) : null;
    if (!match) return null;
    const year = Number(match[1]);
    const index = Number(match[2]) - 1;
    return {
        from: new Date(Date.UTC(year, index, 1) - IST_OFFSET_MS),
        to: new Date(Date.UTC(year, index + 1, 1) - IST_OFFSET_MS),
    };
}

/** "2026-10-17" for an instant, as the day reads in India. */
export function istDay(at: Date): string {
    return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// ── Invoice status ───────────────────────────────────────────────────────

/** Billing › Invoices' status chips (R29), as the API takes them. */
export const INVOICE_STATUSES = ["paid", "unpaid", "refunded"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// ── The month's GST export ───────────────────────────────────────────────

/** What the export reads of one invoice. */
export interface InvoiceForCsv {
    number: string;
    issuedAt: Date;
    billToName: string;
    billToGstin: string | null;
    placeOfSupply: string | null;
    taxType: string;
    taxablePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    totalPaise: number;
    lines: { sac: string | null }[];
    /** The provider's ids, so a row is found in its dashboard (DEC-166). */
    providerPaymentId?: string | null;
    providerSubscriptionId?: string | null;
    providerCustomerId?: string | null;
}

export const INVOICE_CSV_HEADER = [
    "Document",
    "Number",
    "Date",
    "Buyer name",
    "Buyer GSTIN",
    "Place of supply",
    "State code",
    "Supply",
    "SAC",
    "Taxable value",
    "CGST",
    "SGST",
    "IGST",
    "Total",
    // The billing provider's ids (DEC-166): the payment, the subscription
    // (or a yearly plan's order) and the customer, to match in its dashboard.
    "Payment id",
    "Subscription id",
    "Customer id",
] as const;

/**
 * One cell, quoted when it must be, and never read as a formula by a
 * spreadsheet: text starting with = + - @ (or a tab or return) gets a
 * leading apostrophe; a plain number ("-12.50") is left alone. Buyer
 * names are typed by businesses.
 */
export function csvCell(value: string | number | null): string {
    if (value === null) return "";
    let text = String(value);
    if (
        typeof value === "string" &&
        /^[=+\-@\t\r]/.test(text) &&
        !/^-?\d+(\.\d+)?$/.test(text)
    ) {
        text = `'${text}`;
    }
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** B2B when the buyer gave a GSTIN, B2C otherwise (how GSTR-1 splits them). */
function supplyOf(invoice: InvoiceForCsv): string {
    return invoice.billToGstin ? "B2B" : "B2C";
}

/** The invoice's SAC codes, each once, in line order. */
function sacOf(invoice: InvoiceForCsv): string {
    const codes: string[] = [];
    for (const line of invoice.lines) {
        if (line.sac && !codes.includes(line.sac)) codes.push(line.sac);
    }
    return codes.join(" ");
}

/** One invoice as its export row (rupees with paise, "1234.50"). */
export function invoiceCsvRow(invoice: InvoiceForCsv): string[] {
    return [
        "Invoice",
        invoice.number,
        istDay(invoice.issuedAt),
        invoice.billToName,
        invoice.billToGstin ?? "",
        stateName(invoice.placeOfSupply) ?? "",
        invoice.placeOfSupply ?? "",
        supplyOf(invoice),
        sacOf(invoice),
        paiseToRupees(invoice.taxablePaise),
        paiseToRupees(invoice.cgstPaise),
        paiseToRupees(invoice.sgstPaise),
        paiseToRupees(invoice.igstPaise),
        paiseToRupees(invoice.totalPaise),
        invoice.providerPaymentId ?? "",
        invoice.providerSubscriptionId ?? "",
        invoice.providerCustomerId ?? "",
    ];
}

/**
 * The month's export, for GST filing: a header, then one row per document
 * in the order given (number order). No totals row, so the file imports as
 * it is; the screen shows the totals. Saroh issues no credit notes today
 * (nothing in the schema holds one), so every row is an invoice; the
 * "Document" column is where a credit note would say so.
 */
export function invoicesCsv(invoices: InvoiceForCsv[]): string {
    const rows: string[][] = [
        [...INVOICE_CSV_HEADER],
        ...invoices.map(invoiceCsvRow),
    ];
    // CRLF, as RFC 4180 has it; spreadsheets open either.
    return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** "saroh-invoices-2026-10.csv". */
export function invoicesCsvFileName(month: string): string {
    return `saroh-invoices-${month}.csv`;
}

// ── Subscriptions ────────────────────────────────────────────────────────

export const SUBSCRIPTION_STATUSES = [
    "TRIALING",
    "ACTIVE",
    "PAST_DUE",
    "CANCELLED",
] as const;
export type SubscriptionStatusKey = (typeof SUBSCRIPTION_STATUSES)[number];

/** The subscriptions screen's ready-made views. */
export const SUBSCRIPTION_VIEWS = [
    "ending-soon",
    "first-month",
    "past-due",
] as const;
export type SubscriptionView = (typeof SUBSCRIPTION_VIEWS)[number];

/** "Ending soon" looks this far ahead. */
export const ENDING_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The Prisma `where` for a view. "Ending soon": a move to another plan, or
 * an end the business chose, inside the next 30 days. "First month": still
 * TRIALING. "Past due": a charge failed and has not been recovered.
 */
export function subscriptionViewWhere(
    view: SubscriptionView | undefined,
    now: Date,
): Prisma.SubscriptionWhereInput {
    if (view === "first-month") return { status: "TRIALING" };
    if (view === "past-due") return { status: "PAST_DUE" };
    if (view === "ending-soon") {
        const until = new Date(now.getTime() + ENDING_SOON_DAYS * DAY_MS);
        return {
            status: { not: "CANCELLED" },
            OR: [
                { pendingFrom: { not: null, lte: until } },
                {
                    cancelAtPeriodEnd: true,
                    currentPeriodEnd: { not: null, lte: until },
                },
            ],
        };
    }
    return {};
}

/** A plan's price as the summary reads it, from its database row. */
export interface PlanPrice {
    priceCents: number;
    interval: string;
}

/**
 * What one subscription on a plan brings in a month, before GST, in paise:
 * the plan row's price, a year's price spread over twelve months (rounded
 * to the paisa). Never a price written in code: the repo is public and
 * prices live only in the database.
 */
export function monthlyPaise(plan: PlanPrice): number {
    if (plan.priceCents <= 0) return 0;
    return plan.interval === "year"
        ? Math.round(plan.priceCents / 12)
        : plan.priceCents;
}

/** Statuses that count towards the monthly figure: being charged. */
export const PAYING_STATUSES: readonly string[] = ["ACTIVE", "PAST_DUE"];

/**
 * The monthly recurring revenue of a set of subscriptions, from each
 * plan's listed price: ACTIVE and PAST_DUE only (a first month is a
 * nominal charge and a cancelled plan pays nothing). Coupons, custom
 * prices and add-ons are not counted, so it is the list-price figure.
 */
export function mrrPaise(
    groups: { status: string; count: number; plan: PlanPrice }[],
): number {
    let total = 0;
    for (const group of groups) {
        if (!PAYING_STATUSES.includes(group.status)) continue;
        total += group.count * monthlyPaise(group.plan);
    }
    return total;
}

// ── A row's next charge ──────────────────────────────────────────────────

/**
 * How a subscription's next charge is taken: on the autopay the business
 * approved, not at all because the year was paid at once, or none (Free,
 * ended, ending, or not billed through a checkout).
 */
export type NextChargeHow = "AUTOPAY" | "PAID_FOR_YEAR" | "NONE";

/** "Autopay runs out soon" looks this far ahead. */
export const AUTOPAY_RUNS_OUT_DAYS = 30;

export interface NextCharge {
    nextChargeAt: Date | null;
    nextChargeHow: NextChargeHow;
    /** The autopay's approved charges end within 30 days. */
    autopayRunsOutSoon: boolean;
}

/**
 * When and how a subscription is charged next, from its row and its term
 * (`billing-term.ts`). The autopay charges at the end of the period it is
 * in, unless the approval it runs on ends with that period; a year paid at
 * once is charged nothing more; a plan ending at its period's end, a free
 * one and an ended one are charged nothing.
 */
export function nextChargeOf(
    sub: {
        status: string;
        cancelAtPeriodEnd: boolean;
        currentPeriodEnd: Date | null;
        billingCycle: string;
        providerSubscriptionId: string | null;
        plan: { priceCents: number };
    },
    term: { payment: "AUTOPAY" | "ONE_TIME"; endsAt: Date } | null,
    now: Date,
): NextCharge {
    const none: NextCharge = {
        nextChargeAt: null,
        nextChargeHow: "NONE",
        autopayRunsOutSoon: false,
    };
    if (sub.status === "CANCELLED" || sub.plan.priceCents <= 0) return none;
    const yearPaidOnce =
        term?.payment === "ONE_TIME" ||
        (!term &&
            sub.billingCycle === "year" &&
            sub.providerSubscriptionId?.startsWith("order_") === true);
    if (yearPaidOnce) return { ...none, nextChargeHow: "PAID_FOR_YEAR" };
    if (sub.cancelAtPeriodEnd) return none;
    const autopayRunsOutSoon =
        term?.payment === "AUTOPAY" &&
        term.endsAt.getTime() <= now.getTime() + AUTOPAY_RUNS_OUT_DAYS * DAY_MS;
    if (!sub.providerSubscriptionId || !sub.currentPeriodEnd) {
        return { ...none, autopayRunsOutSoon };
    }
    if (term && term.endsAt.getTime() <= sub.currentPeriodEnd.getTime()) {
        // The approval ends with this period: nothing more is taken.
        return { ...none, autopayRunsOutSoon };
    }
    return {
        nextChargeAt: sub.currentPeriodEnd,
        nextChargeHow: "AUTOPAY",
        autopayRunsOutSoon,
    };
}
