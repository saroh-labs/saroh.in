import { formatDate } from "@/lib/format/datetime";
import { formatMoneyMajor, minorOf } from "@/lib/format/money";
import { count } from "@/lib/format/plural";
import { METHOD_WORD } from "@/lib/payments/method-words";
import { isSince } from "@/lib/views/since";

import type {
    Invoice,
    InvoiceKind,
    InvoicePayment,
    InvoiceSource,
    InvoiceStanding,
} from "./service";
import {
    CHEQUE_NOT_IN_BANK,
    DRAFT_NOTE,
    NOT_PAID_YET,
    PAID_CHEQUE_WAITING,
    PARTLY_PAID,
    daysLate as daysLateWords,
    leftToPayLine,
    paymentWay,
    toCollect,
    unpaidLine,
} from "./words";

/**
 * How an invoice's status is said, and in what shape (ADR-007).
 *
 * The word carries the meaning and the colour only reinforces it, because
 * a shop floor in bright light resolves colour last. Overdue is derived by
 * the API from the due date; this adds how long, or when it falls due.
 */

type Variant = "info" | "error" | "success" | "neutral";

export interface StatusView {
    label: string;
    variant: Variant;
    /** "Due tomorrow", "3 days overdue" — null when there is nothing to add. */
    detail: string | null;
}

const DAY = 86_400_000;

/**
 * The due date is stored as the end of the chosen day in the timezone of
 * whoever set it, so counting whole days between instants — not UTC calendar
 * dates — keeps these words on the same day the date beside them shows.
 */
function daysLeft(iso: string, now: Date): number {
    return Math.floor((Date.parse(iso) - now.getTime()) / DAY);
}

function daysLate(iso: string, now: Date): number {
    return Math.ceil((now.getTime() - Date.parse(iso)) / DAY);
}

export function invoiceStatus(
    invoice: { standing: InvoiceStanding; dueAt: string | null },
    now: Date = new Date(),
): StatusView {
    switch (invoice.standing) {
        case "DRAFT":
            return { label: "Draft", variant: "neutral", detail: null };
        case "PAID":
            return { label: "Paid", variant: "success", detail: null };
        case "VOID":
            return { label: "Void", variant: "neutral", detail: null };
        case "CREDITED":
            return { label: "Credited", variant: "neutral", detail: null };
        case "OVERDUE": {
            const late = invoice.dueAt ? daysLate(invoice.dueAt, now) : 0;
            return {
                label: "Overdue",
                variant: "error",
                detail: late <= 0 ? "Overdue" : `${count(late, "day")} overdue`,
            };
        }
        case "ISSUED": {
            if (!invoice.dueAt) {
                return { label: "Issued", variant: "info", detail: null };
            }
            const d = daysLeft(invoice.dueAt, now);
            return {
                label: "Issued",
                variant: "info",
                detail:
                    d <= 0
                        ? "Due today"
                        : d === 1
                          ? "Due tomorrow"
                          : `Due in ${d} days`,
            };
        }
    }
}

/**
 * Who it is billed to. An issued invoice keeps the name and email it was
 * issued with, so a deleted or edited contact never changes it; a draft has
 * no bill-to yet and reads the contact.
 */
export function billedTo(invoice: {
    contact: { id: string; name: string; email: string } | null;
    billTo: { name: string | null; email: string | null } | null;
}): { name: string; email: string | null; contactId: string | null } {
    const contactId = invoice.contact?.id ?? null;
    if (invoice.billTo) {
        return {
            name: invoice.billTo.name ?? invoice.billTo.email ?? "Unknown",
            email: invoice.billTo.email,
            contactId,
        };
    }
    if (invoice.contact) {
        return {
            name: invoice.contact.name,
            email: invoice.contact.email,
            contactId,
        };
    }
    return { name: "No one chosen", email: null, contactId: null };
}

const SOURCE: Record<InvoiceSource, string> = {
    SUBSCRIPTION: "Membership",
    PACK: "Class pack",
    COURSE: "Course",
    MANUAL: "Entered by hand",
    ORDER: "Order",
    BOOKING: "Booking",
};

export function sourceLabel(source: InvoiceSource): string {
    return SOURCE[source];
}

/* ------------------------------------------------------------------------
 * The Invoices and Invoice Detail designs ("Saroh Invoices",
 * "Saroh Invoice Detail"): the pill, the tabs, the line under the pill, and
 * what is owed — each worked out from what the API sent, never stored.
 * ---------------------------------------------------------------------- */

type ListInvoice = Pick<
    Invoice,
    | "standing"
    | "source"
    | "kind"
    | "dueAt"
    | "paidAt"
    | "voidedAt"
    | "issuedAt"
    | "total"
    | "leftToPay"
    | "paidSoFar"
    | "partlyPaid"
    | "chequeWaiting"
    | "currency"
    | "order"
    | "related"
    | "summary"
    | "payment"
>;

/** A pill's tone: paid, owed (in play, yours to collect), late, quiet. */
export type PillVariant = "success" | "active" | "error" | "neutral";

/**
 * The word on an invoice's pill. Issued reads "Due" — the design's word for
 * money not yet late — or "Partly paid" once some of it is (DEC-173). An
 * overdue one stays "Overdue" however much is paid: lateness is the news.
 * A paid one whose cheque hasn't cleared reads "Paid · cheque not in the
 * bank", still yours to follow up. An order's credited invoice was refunded
 * on the order; any other credited one was cancelled with a credit note.
 */
export function invoicePill(
    i: Pick<ListInvoice, "standing" | "source" | "kind"> &
        Partial<Pick<ListInvoice, "partlyPaid" | "chequeWaiting">>,
): {
    label: string;
    variant: PillVariant;
} {
    if (i.kind === "CREDIT_NOTE") {
        return { label: "Credit note", variant: "neutral" };
    }
    switch (i.standing) {
        case "DRAFT":
            return { label: "Draft", variant: "neutral" };
        case "ISSUED":
            return i.partlyPaid
                ? { label: PARTLY_PAID, variant: "active" }
                : { label: "Due", variant: "active" };
        case "OVERDUE":
            return { label: "Overdue", variant: "error" };
        case "PAID":
            return i.chequeWaiting
                ? { label: PAID_CHEQUE_WAITING, variant: "active" }
                : { label: "Paid", variant: "success" };
        case "CREDITED":
            return {
                label: i.source === "ORDER" ? "Refunded" : "Cancelled",
                variant: "neutral",
            };
        case "VOID":
            return { label: "Void", variant: "neutral" };
    }
}

export const INVOICE_TABS = [
    { id: "all", label: "All" },
    { id: "due", label: "Due" },
    { id: "overdue", label: "Overdue" },
    { id: "paid", label: "Paid" },
    { id: "draft", label: "Drafts" },
] as const;
export type InvoiceTab = (typeof INVOICE_TABS)[number]["id"];

/**
 * `?view=` is a URL contract older than these tabs: "issued" was the Due
 * tab's name, and "void" had a tab of its own (All shows them now).
 */
export function tabFromView(view: string | undefined): InvoiceTab {
    if (view === "issued") return "due";
    return INVOICE_TABS.some((t) => t.id === view)
        ? (view as InvoiceTab)
        : "all";
}

/** Paid holds the refunded and cancelled ones too: nothing is owed on them. */
export function inTab(
    i: Pick<ListInvoice, "standing" | "kind">,
    tab: InvoiceTab,
): boolean {
    if (tab === "all") return true;
    if (i.kind === "CREDIT_NOTE") return false;
    switch (tab) {
        case "due":
            return i.standing === "ISSUED";
        case "overdue":
            return i.standing === "OVERDUE";
        case "paid":
            return i.standing === "PAID" || i.standing === "CREDITED";
        case "draft":
            return i.standing === "DRAFT";
    }
}

/**
 * Money owed on it: issued and unpaid, and neither an order's paper — the
 * order is where that is owed — nor a credit note (ADR-008, `OWED_WHERE`).
 */
export function isOwed(
    i: Pick<ListInvoice, "standing" | "kind" | "order" | "source">,
): boolean {
    return (
        (i.standing === "ISSUED" || i.standing === "OVERDUE") &&
        i.kind !== "CREDIT_NOTE" &&
        !i.order &&
        i.source !== "ORDER"
    );
}

/**
 * What is owed and what of it is overdue, per currency, in minor units — the
 * API priced each invoice; this only adds them, in whole paise.
 */
export function owedSummary(
    invoices: Pick<
        ListInvoice,
        | "standing"
        | "kind"
        | "order"
        | "source"
        | "total"
        | "leftToPay"
        | "currency"
    >[],
): {
    owed: { currency: string; cents: number }[];
    overdue: { currency: string; cents: number }[];
    overdueCount: number;
} {
    const owed = new Map<string, number>();
    const overdue = new Map<string, number>();
    let overdueCount = 0;
    for (const i of invoices) {
        if (!isOwed(i)) continue;
        // What is left to pay on it (DEC-173), not its whole total.
        const left = minorOf(i.leftToPay ?? i.total) ?? 0;
        owed.set(i.currency, (owed.get(i.currency) ?? 0) + left);
        if (i.standing === "OVERDUE") {
            overdueCount += 1;
            overdue.set(i.currency, (overdue.get(i.currency) ?? 0) + left);
        }
    }
    const list = (m: Map<string, number>) =>
        Array.from(m.entries()).map(([currency, c]) => ({
            currency,
            cents: c,
        }));
    return { owed: list(owed), overdue: list(overdue), overdueCount };
}

/**
 * Where it came from, in the design's words: "Order #1020", "Sourdough
 * subscription", "Written by hand", or what a correction corrects.
 */
export function sourceLine(
    i: Pick<ListInvoice, "source" | "kind" | "order" | "related" | "summary">,
): string {
    if (i.kind === "CREDIT_NOTE") {
        return `Credit note for ${i.related?.number ?? "an invoice"}`;
    }
    if (i.kind === "SUPPLEMENTARY") {
        return `Supplementary to ${i.related?.number ?? "an invoice"}`;
    }
    switch (i.source) {
        case "ORDER":
            return i.order ? `Order #${i.order.number}` : "Order";
        case "SUBSCRIPTION": {
            // A renewal's line is "<plan> · <period>"; the plan names it.
            const plan = i.summary?.description.split(" · ")[0]?.trim();
            return plan ? `${plan} subscription` : "Subscription";
        }
        case "MANUAL":
            return "Written by hand";
        case "PACK":
            return "Class pack";
        case "COURSE":
            return "Course";
        case "BOOKING":
            return "Booking";
    }
}

const PAID_BY: Record<string, string> = {
    ONLINE: "Online",
    // An order's paper records how the order was paid, not a method.
    ORDER: "With the order",
    RECORDED: "Recorded by hand",
    // Only an invoice takes a cheque (DEC-173), so it isn't a picker word.
    CHEQUE: "Cheque",
    // One word each, as every picker says them (UX-078).
    ...METHOD_WORD,
};

/** How it was paid; an order's paper may name a way this list doesn't know. */
export function paidBy(method: string): string {
    return (
        PAID_BY[method] ??
        method.charAt(0) + method.slice(1).toLowerCase().replace(/_/g, " ")
    );
}

/**
 * How it was paid, inside a sentence: "Paid 29 Sep online", "Paid by UPI".
 * Lower-casing `paidBy` wrote "by online" and "by upi".
 */
export function paidHow(method: string): string {
    switch (method) {
        case "ONLINE":
            return "online";
        case "ORDER":
            return "with the order";
        case "RECORDED":
            return "(recorded by hand)";
        case "OTHER":
            return "another way";
        case "UPI":
            return "by UPI";
        case "CHEQUE":
            return "by cheque";
    }
    return `by ${paidBy(method).toLowerCase()}`;
}

/**
 * The line under the pill, in parts so the date can be written in the
 * viewer's timezone: "Due · 22 Sep · in 4 days", "3 days late", "Paid 18 Sep
 * · UPI". `date` is the instant to show between `before` and `after`.
 */
export function whenLine(
    i: ListInvoice,
    now: Date = new Date(),
): { before: string; date: string | null; after: string; late: boolean } {
    const none = { date: null, after: "", late: false };
    if (i.kind === "CREDIT_NOTE") {
        return {
            ...none,
            before: i.issuedAt ? "Issued " : "Not issued yet",
            date: i.issuedAt,
        };
    }
    switch (i.standing) {
        case "DRAFT":
            return { ...none, before: "Not issued, no number yet" };
        case "OVERDUE": {
            const late = i.dueAt ? Math.max(1, daysLate(i.dueAt, now)) : 0;
            return {
                ...none,
                before: late ? `${count(late, "day")} late` : "Overdue",
                late: true,
            };
        }
        case "ISSUED": {
            if (!i.dueAt) return { ...none, before: "Not paid yet" };
            const d = daysLeft(i.dueAt, now);
            return {
                before: "Due ",
                date: i.dueAt,
                after: d <= 0 ? " · today" : ` · in ${count(d, "day")}`,
                late: false,
            };
        }
        case "PAID":
            return {
                before: i.paidAt ? "Paid " : "Paid",
                date: i.paidAt,
                after: i.payment ? ` · ${paidBy(i.payment.method)}` : "",
                late: false,
            };
        case "CREDITED":
            return {
                ...none,
                before:
                    i.source === "ORDER"
                        ? "Refunded · credit note issued"
                        : "Cancelled by a credit note",
            };
        case "VOID":
            return {
                ...none,
                before: i.voidedAt ? "Voided " : "Voided",
                date: i.voidedAt,
            };
    }
}

/**
 * The list in the order it reads: newest first, with each credit note and
 * supplementary invoice straight under the invoice it corrects when that is
 * in the list too.
 */
export function withCorrectionsUnder<
    T extends {
        id: string;
        kind?: InvoiceKind;
        related?: { id: string } | null;
    },
>(rows: T[]): T[] {
    const ids = new Set(rows.map((r) => r.id));
    const isNested = (r: T) =>
        r.kind !== undefined &&
        r.kind !== "INVOICE" &&
        r.related != null &&
        ids.has(r.related.id);
    const under = new Map<string, T[]>();
    for (const r of rows) {
        if (!isNested(r) || !r.related) continue;
        const key = r.related.id;
        under.set(key, [...(under.get(key) ?? []), r]);
    }
    const out: T[] = [];
    for (const r of rows) {
        if (isNested(r)) continue;
        out.push(r, ...(under.get(r.id) ?? []));
    }
    return out;
}

/**
 * The invoices a Home money figure's link opens: those money came in on
 * from `since`, credit notes never. `fromApi` is the API's own
 * `?paidSince=` read (H-7), which finds an old invoice paid today and
 * applies the one money-in rule (DEC-173): a part payment received since
 * counts, though the invoice isn't paid yet, so its rows are taken as they
 * come. Without it the capped list on hand is filtered by paid date
 * instead. No `since`: every invoice on hand.
 */
export function paidSinceRows<
    T extends { kind?: InvoiceKind; paidAt?: string | null },
>(onHand: T[], fromApi: T[] | null, since: Date | null): T[] {
    if (!since) return onHand;
    if (fromApi) return fromApi.filter((i) => i.kind !== "CREDIT_NOTE");
    return onHand.filter(
        (i) => i.kind !== "CREDIT_NOTE" && isSince(i.paidAt, since),
    );
}

/** An HSN or SAC as the design sets it: "1905 90 10", "9968 13". */
export function spacedCode(code: string | null | undefined): string {
    if (!code) return "";
    const c = code.replace(/\s+/g, "");
    return [c.slice(0, 4), c.slice(4, 6), c.slice(6)].filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------------
 * The ledger's states (DEC-173): what the details sheet, the page, the list
 * and the phone all say, worked out from what the API sent. Partly paid and
 * a waiting cheque are derived, like Overdue, never stored.
 * ---------------------------------------------------------------------- */

/**
 * Which of the screens' states an invoice is in: one per row of U7's table.
 * `paidChequeWaiting` is paid in full with a cheque still to clear; a part
 * paid by a waiting cheque is `partlyPaid`, and says so on its cheque.
 */
export type InvoiceState =
    | "draft"
    | "due"
    | "overdue"
    | "partlyPaid"
    | "paidChequeWaiting"
    | "paid"
    | "void"
    | "credited"
    | "creditNote";

export function invoiceState(
    i: Pick<Invoice, "standing" | "kind"> &
        Partial<Pick<Invoice, "partlyPaid" | "chequeWaiting">>,
): InvoiceState {
    if (i.kind === "CREDIT_NOTE") return "creditNote";
    switch (i.standing) {
        case "DRAFT":
            return "draft";
        case "ISSUED":
        case "OVERDUE":
            if (i.partlyPaid) return "partlyPaid";
            return i.standing === "OVERDUE" ? "overdue" : "due";
        case "PAID":
            return i.chequeWaiting ? "paidChequeWaiting" : "paid";
        case "VOID":
            return "void";
        case "CREDITED":
            return "credited";
    }
}

/** Whole days past its due date: 0 when it isn't late, at least 1 when it is. */
export function lateBy(
    i: Pick<Invoice, "standing" | "dueAt">,
    now: Date = new Date(),
): number {
    if (i.standing !== "OVERDUE") return 0;
    return i.dueAt ? Math.max(1, daysLate(i.dueAt, now)) : 1;
}

/**
 * What is left to pay, in paise: the API's `leftToPay`, or, from an API
 * before the ledger, the whole total while it is owed. Nothing on paper
 * that isn't owed.
 */
export function leftCents(
    i: Pick<Invoice, "standing" | "kind" | "total"> &
        Partial<Pick<Invoice, "leftToPay">>,
): number {
    if (i.kind === "CREDIT_NOTE") return 0;
    if (i.standing !== "ISSUED" && i.standing !== "OVERDUE") return 0;
    return minorOf(i.leftToPay) ?? minorOf(i.total) ?? 0;
}

/**
 * What has come in, in paise: the API's `paidSoFar`, or, from an API before
 * the ledger, the total once paid and nothing before.
 */
export function paidCents(
    i: Pick<Invoice, "standing" | "total"> &
        Partial<Pick<Invoice, "paidSoFar">>,
): number {
    const paid = minorOf(i.paidSoFar);
    if (paid !== null) return paid;
    return i.standing === "PAID" ? (minorOf(i.total) ?? 0) : 0;
}

/**
 * The header's pill, with how late: "Overdue · 13 days" (INVPageA). Every
 * other state reads as `invoicePill` does.
 */
export function headerPill(
    i: Pick<Invoice, "standing" | "source" | "kind" | "dueAt"> &
        Partial<Pick<Invoice, "partlyPaid" | "chequeWaiting">>,
    now: Date = new Date(),
): { label: string; variant: PillVariant } {
    const pill = invoicePill(i);
    if (i.kind === "CREDIT_NOTE" || i.standing !== "OVERDUE") return pill;
    return { ...pill, label: `Overdue · ${count(lateBy(i, now), "day")}` };
}

/**
 * The one line that says what is unpaid on a late invoice: "₹2,500 unpaid ·
 * 13 days late", what is left rather than the total. Null on one that
 * isn't late.
 */
export function overdueLine(
    i: Pick<Invoice, "standing" | "kind" | "total" | "currency" | "dueAt"> &
        Partial<Pick<Invoice, "leftToPay">>,
    now: Date = new Date(),
): string | null {
    if (i.kind === "CREDIT_NOTE" || i.standing !== "OVERDUE") return null;
    const money = formatMoneyMajor(leftCents(i) / 100, i.currency);
    return unpaidLine(money, lateBy(i, now));
}

export type MoneyTone = "neutral" | "owed" | "late" | "paid" | "waiting";

/**
 * The details' money card (INVPageA, INVRecordPlus): one message per state,
 * said once. `title` is the figure that matters, `detail` the line under it.
 * Dates are the business's (`timeZone`), as the paper prints them.
 */
export interface MoneyMessage {
    title: string;
    detail: string | null;
    tone: MoneyTone;
}

/** The newest payment that still counts: what "cash on 12 Oct" is about. */
export function lastLivePayment(
    payments: InvoicePayment[] | undefined,
): InvoicePayment | null {
    const live = (payments ?? []).filter(
        (p) => !p.removed && p.bankStatus !== "BOUNCED",
    );
    return live.at(-1) ?? null;
}

/** The cheque waiting for the bank, if one is. */
export function waitingCheque(
    payments: InvoicePayment[] | undefined,
): InvoicePayment | null {
    return (
        (payments ?? []).find(
            (p) => !p.removed && p.bankStatus === "WAITING",
        ) ?? null
    );
}

/** "By bank transfer", "In cash", "Online": the start of the paid line. */
function paidByStart(method: string): string {
    switch (method) {
        case "CASH":
            return "In cash";
        case "ONLINE":
            return "Online";
        case "OTHER":
            return "Recorded by hand";
    }
    return `By ${paymentWay(method)}`;
}

export function moneyMessage(
    i: Pick<
        Invoice,
        | "standing"
        | "kind"
        | "total"
        | "currency"
        | "dueAt"
        | "paidAt"
        | "payment"
        | "order"
        | "related"
    > &
        Partial<
            Pick<
                Invoice,
                | "leftToPay"
                | "paidSoFar"
                | "partlyPaid"
                | "chequeWaiting"
                | "payments"
            >
        >,
    { timeZone, now = new Date() }: { timeZone: string; now?: Date },
): MoneyMessage {
    const money = (cents: number) => formatMoneyMajor(cents / 100, i.currency);
    const day = (iso: string) => formatDate(iso, timeZone, { now });
    const total = money(minorOf(i.total) ?? 0);
    const last = lastLivePayment(i.payments);
    // "cash on 12 Oct": how and when the last money that counts came in.
    const how = (p: InvoicePayment | null) =>
        p ? `${paymentWay(p.method)} on ${day(p.receivedAt)}` : null;

    switch (invoiceState(i)) {
        case "creditNote":
            return {
                title: `Credit note · ${total}`,
                detail: `Nothing is owed on it. It cancels ${i.related?.number ?? "an invoice"}.`,
                tone: "neutral",
            };
        case "draft":
            return {
                title: `Draft · ${total}`,
                detail: DRAFT_NOTE,
                tone: "neutral",
            };
        case "void":
            return {
                title: "Void",
                detail: "Nothing is owed.",
                tone: "neutral",
            };
        case "credited":
            return {
                title: i.order ? "Refunded on the order" : "Cancelled",
                detail: "A credit note cancels it. Nothing is owed.",
                tone: "neutral",
            };
        case "partlyPaid": {
            const paid = money(paidCents(i));
            const late = lateBy(i, now);
            return {
                title: leftToPayLine(money(leftCents(i))),
                detail: [
                    `Paid ${paid} of ${total}`,
                    how(last),
                    late ? daysLateWords(late) : null,
                ]
                    .filter(Boolean)
                    .join(" · "),
                tone: late ? "late" : "owed",
            };
        }
        case "overdue": {
            const due = i.dueAt ? `due ${day(i.dueAt)}` : null;
            return {
                title: toCollect(money(leftCents(i))),
                detail: [daysLateWords(lateBy(i, now)), due]
                    .filter(Boolean)
                    .join(" · "),
                tone: "late",
            };
        }
        case "due":
            return {
                title: toCollect(money(leftCents(i))),
                detail: i.dueAt
                    ? `Due ${day(i.dueAt)}. ${NOT_PAID_YET}`
                    : NOT_PAID_YET,
                tone: "owed",
            };
        case "paidChequeWaiting": {
            const cheque = waitingCheque(i.payments);
            const parts = [
                cheque?.cheque?.number
                    ? `Cheque ${cheque.cheque.number}`
                    : "Cheque",
                cheque?.cheque?.bank ?? null,
                cheque ? `received ${day(cheque.receivedAt)}` : null,
            ];
            return {
                title: CHEQUE_NOT_IN_BANK,
                detail: `Paid ${total} · ${parts.filter(Boolean).join(" · ")}`,
                tone: "waiting",
            };
        }
        case "paid": {
            if (i.order) {
                return {
                    title: `Paid ${total}`,
                    detail: "With the order. Its payments and refunds are made on the order.",
                    tone: "paid",
                };
            }
            const p = last;
            const method = p ? p.method : (i.payment?.method ?? null);
            const at = p ? p.receivedAt : i.paidAt;
            // The ledger's own payment when there is one; the row's (an API
            // before the ledger) otherwise, never a mix of the two.
            const ref = p ? p.reference : (i.payment?.reference ?? null);
            const by = method ? paidByStart(method) : "Paid";
            const detail = [
                at ? `${by} on ${day(at)}` : method ? by : null,
                ref ? `ref ${ref}` : null,
            ]
                .filter(Boolean)
                .join(" · ");
            return {
                title: `Paid ${total}`,
                detail: detail || null,
                tone: "paid",
            };
        }
    }
}
