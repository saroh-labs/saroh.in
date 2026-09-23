import type {
    Invoice,
    InvoiceKind,
    InvoiceSource,
    InvoiceStanding,
} from "./service";

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
                detail:
                    late <= 0
                        ? "Overdue"
                        : `${late} ${late === 1 ? "day" : "days"} overdue`,
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
    | "currency"
    | "order"
    | "related"
    | "summary"
    | "payment"
>;

/** A pill's colour role, after the design: ok, accent, bad, off. */
export type PillVariant = "success" | "draft" | "error" | "neutral";

/**
 * The word on an invoice's pill. Issued reads "Due" — the design's word for
 * money not yet late. An order's credited invoice was refunded on the order;
 * any other credited one was cancelled with a credit note.
 */
export function invoicePill(
    i: Pick<ListInvoice, "standing" | "source" | "kind">,
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
            return { label: "Due", variant: "draft" };
        case "OVERDUE":
            return { label: "Overdue", variant: "error" };
        case "PAID":
            return { label: "Paid", variant: "success" };
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

const cents = (amount: string) => Math.round(Number(amount) * 100);

/**
 * What is owed and what of it is overdue, per currency, in minor units — the
 * API priced each invoice; this only adds them, in whole paise.
 */
export function owedSummary(
    invoices: Pick<
        ListInvoice,
        "standing" | "kind" | "order" | "source" | "total" | "currency"
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
        owed.set(i.currency, (owed.get(i.currency) ?? 0) + cents(i.total));
        if (i.standing === "OVERDUE") {
            overdueCount += 1;
            overdue.set(
                i.currency,
                (overdue.get(i.currency) ?? 0) + cents(i.total),
            );
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
    CASH: "Cash",
    UPI: "UPI",
    BANK_TRANSFER: "Bank transfer",
    CARD: "Card",
    OTHER: "Another way",
};

/** How it was paid; an order's paper may name a way this list doesn't know. */
export function paidBy(method: string): string {
    return (
        PAID_BY[method] ??
        method.charAt(0) + method.slice(1).toLowerCase().replace(/_/g, " ")
    );
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
            return { ...none, before: "Not issued — no number yet" };
        case "OVERDUE": {
            const late = i.dueAt ? Math.max(1, daysLate(i.dueAt, now)) : 0;
            return {
                ...none,
                before: late
                    ? `${late} ${late === 1 ? "day" : "days"} late`
                    : "Overdue",
                late: true,
            };
        }
        case "ISSUED": {
            if (!i.dueAt) return { ...none, before: "Not paid yet" };
            const d = daysLeft(i.dueAt, now);
            return {
                before: "Due ",
                date: i.dueAt,
                after:
                    d <= 0
                        ? " · today"
                        : ` · in ${d} ${d === 1 ? "day" : "days"}`,
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

/** An HSN or SAC as the design sets it: "1905 90 10", "9968 13". */
export function spacedCode(code: string | null | undefined): string {
    if (!code) return "";
    const c = code.replace(/\s+/g, "");
    return [c.slice(0, 4), c.slice(4, 6), c.slice(6)].filter(Boolean).join(" ");
}
