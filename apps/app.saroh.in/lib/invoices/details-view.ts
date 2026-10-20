import { formatMoneyMajor } from "@/lib/format/money";

import { sentLine } from "./send";
import type { Invoice, InvoicePayment } from "./service";
import type { InvoiceTab } from "./status";
import { paidHow } from "./status";
import { paymentEvents, sharedLine } from "./words";

/**
 * What one invoice's details draw that isn't a rule of its state (DEC-173,
 * U9 #1121): its history, and where Previous and Next go in the list the
 * sheet opened from. Pure, so the sheet and the page are tested here
 * rather than read off a screen.
 */

/** The dot beside a line: money in, money gone, waiting, or neither. */
export type HistoryTone = "ok" | "bad" | "waiting" | "plain";

export interface HistoryLine {
    key: string;
    what: string;
    /** When; null for a correction, which the read gives no date. */
    when: string | null;
    tone: HistoryTone;
    /** It no longer counts (a payment removed or bounced): struck through. */
    struck?: boolean;
    /** The live payment this line records, which may be removed. */
    removable?: InvoicePayment;
}

/**
 * "What happened", newest first: the payments (each one's events, a
 * removed one struck through with why), the shares by hand, the sends and
 * reminders, issued and drafted, voided, and the corrections made against
 * it. Only what is recorded: an invoice read from before the ledger keeps
 * its one "Paid" line from the invoice's own date.
 */
export function historyLines(
    i: Invoice,
    now: Date = new Date(),
): HistoryLine[] {
    const money = (a: string) => formatMoneyMajor(a, i.currency);
    const lines: HistoryLine[] = [];
    for (const c of i.corrections ?? []) {
        lines.push({
            key: c.id,
            what: `${c.kind === "CREDIT_NOTE" ? "Credit note" : "Supplementary invoice"} ${c.number ?? ""} for ${money(c.total)}`,
            when: null,
            tone: "plain",
        });
    }
    if (i.voidedAt) {
        lines.push({
            key: "void",
            what: `Voided${i.voidReason ? `: ${i.voidReason}` : ""}`,
            when: i.voidedAt,
            tone: "plain",
        });
    }

    const payments = i.payments ?? [];
    const totalCents = Math.round(Number(i.total) * 100);
    for (const p of payments) {
        paymentEvents(p, totalCents).forEach((e, n) => {
            const first = n === 0;
            lines.push({
                key: `${p.id}:${n}`,
                what: e.text,
                when: e.at,
                tone: e.struck
                    ? "plain"
                    : /bounced|removed/.test(e.text)
                      ? "bad"
                      : p.bankStatus === "WAITING"
                        ? "waiting"
                        : "ok",
                struck: e.struck,
                removable: first && p.canRemove ? p : undefined,
            });
        });
    }
    // An API from before the ledger: the invoice's own paid line.
    if (payments.length === 0 && i.paidAt) {
        lines.push({
            key: "paid",
            what: i.payment
                ? `Paid ${paidHow(i.payment.method)}${i.payment.reference ? ` · ${i.payment.reference}` : ""}`
                : "Paid",
            when: i.paidAt,
            tone: "ok",
        });
    }

    for (const s of i.shared ?? []) {
        lines.push({
            key: s.id,
            what: sharedLine(s),
            when: s.at,
            tone: "plain",
        });
    }
    for (const s of i.sent ?? []) {
        lines.push({ key: s.id, what: sentLine(s), when: s.at, tone: "plain" });
    }
    if (
        i.standing === "OVERDUE" &&
        i.dueAt &&
        Date.parse(i.dueAt) < now.getTime()
    ) {
        lines.push({
            key: "due",
            what: "Due date passed",
            when: i.dueAt,
            tone: "bad",
        });
    }
    if (i.issuedAt) {
        // Only a subscription's paper is issued by the renewal; a booking,
        // a pack or a course bought online is issued automatically too.
        const by = i.order
            ? ` for order #${i.order.number}`
            : i.issuedAutomatically && i.source === "SUBSCRIPTION"
              ? " by the subscription renewal"
              : "";
        lines.push({
            key: "issued",
            what: `${i.number ?? "It"} issued${by}`,
            when: i.issuedAt,
            tone: "plain",
        });
    }
    if (!i.issuedAutomatically && !i.order) {
        lines.push({
            key: "drafted",
            what: "Drafted",
            when: i.createdAt,
            tone: "plain",
        });
    }

    // Newest first; a correction, which has no date, at the top. A tie
    // keeps the order written above (a payment's events oldest first
    // would read backwards, so they are reversed with the rest).
    return lines
        .map((l, n) => ({ l, n }))
        .sort((a, b) => {
            const ta = a.l.when === null ? Infinity : Date.parse(a.l.when);
            const tb = b.l.when === null ? Infinity : Date.parse(b.l.when);
            return tb - ta || b.n - a.n;
        })
        .map(({ l }) => l);
}

/** The rows either side of this one in the list the sheet opened from. */
export function neighbours<T extends { id: string }>(
    rows: readonly T[],
    id: string | null,
): { previous: T | null; next: T | null } {
    const at = id === null ? -1 : rows.findIndex((r) => r.id === id);
    if (at === -1) return { previous: null, next: null };
    return { previous: rows[at - 1] ?? null, next: rows[at + 1] ?? null };
}

/** "Next overdue" on the Overdue filter, "Next draft" on Drafts, else "Next". */
export function nextLabel(tab: InvoiceTab): string {
    switch (tab) {
        case "overdue":
            return "Next overdue";
        case "due":
            return "Next due";
        case "paid":
            return "Next paid";
        case "draft":
            return "Next draft";
        case "all":
            return "Next";
    }
}

/**
 * The line at the top of "What happened" while money is owed here and this
 * person can act on it (INVPageA): what comes next is theirs.
 */
export function nextStep(
    i: Pick<Invoice, "standing" | "kind" | "order"> &
        Partial<Pick<Invoice, "partlyPaid">>,
    who: string,
    canWrite: boolean,
): { what: string; sub: string } | null {
    if (!canWrite || i.kind === "CREDIT_NOTE" || i.order) return null;
    if (i.standing !== "ISSUED" && i.standing !== "OVERDUE") return null;
    const first = who.split(" ")[0] || who;
    return {
        what: "Next step is yours",
        sub: i.partlyPaid
            ? `Share it, call ${first}, or record the rest`
            : `Share it, call ${first}, or record the payment`,
    };
}
