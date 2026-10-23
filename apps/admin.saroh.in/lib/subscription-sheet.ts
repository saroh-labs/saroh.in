/**
 * The subscription sheet in words (admin plan U15, R27): its tabs and the
 * History chips as query keys, the history's rows as the API sends them,
 * and the one problem the banner names. Client-safe: no server imports.
 *
 * The sheet's place is the address, like every Billing filter: `open` is
 * the subscription, `sheet` its tab (Summary when left out), `history` the
 * chip and `hpage` the history's page.
 */

import type { SarohSubscriptionDetail } from "./billing-words";
import { formatPaise, istDate } from "./billing-words";

// ── Tabs ─────────────────────────────────────────────────────────────────

export const SHEET_TABS = ["summary", "history", "invoices"] as const;
export type SheetTab = (typeof SHEET_TABS)[number];

export const SHEET_TAB_LABEL: Record<SheetTab, string> = {
    summary: "Summary",
    history: "History",
    invoices: "Invoices",
};

/** The tab from `?sheet=`; Summary when it is anything else. */
export function readSheetTab(value: string | undefined): SheetTab {
    return SHEET_TABS.find((t) => t === value) ?? "summary";
}

// ── History ──────────────────────────────────────────────────────────────

/** Everything · Provider events · Invoices · Saroh and staff. */
export const HISTORY_SHOWS = [
    "everything",
    "provider",
    "invoices",
    "saroh",
] as const;
export type HistoryShow = (typeof HISTORY_SHOWS)[number];

export const HISTORY_SHOW_LABEL: Record<HistoryShow, string> = {
    everything: "Everything",
    provider: "Provider events",
    invoices: "Invoices",
    saroh: "Saroh and staff",
};

export function readHistoryShow(value: string | undefined): HistoryShow {
    return HISTORY_SHOWS.find((s) => s === value) ?? "everything";
}

export type HistoryKind = "provider" | "invoice" | "email" | "staff";

/** A row's tag. */
export const HISTORY_KIND_LABEL: Record<HistoryKind, string> = {
    provider: "Razorpay",
    invoice: "Invoice",
    email: "Email",
    staff: "Staff",
};

/** One line of the timeline, as the API sends it. */
export interface BillingHistoryRow {
    id: string;
    at: string;
    kind: HistoryKind;
    title: string;
    line: string | null;
    /** A provider event's are its type and event id: what Razorpay sent. */
    refs: Record<string, string>;
}

export interface BillingHistoryPage {
    items: BillingHistoryRow[];
    page: number;
    limit: number;
    hasMore: boolean;
    show: HistoryShow;
}

/** A row's tag: Saroh's own actions say "Saroh", not "Staff". */
export function historyTag(row: BillingHistoryRow): string {
    if (row.kind === "staff" && row.line?.startsWith("Saroh")) return "Saroh";
    return HISTORY_KIND_LABEL[row.kind];
}

// ── The problem banner ───────────────────────────────────────────────────

/** Which of today's actions fixes it, if one does. */
export type ProblemFix =
    { kind: "sync" } | { kind: "recheck"; providerPaymentId: string } | null;

export interface Problem {
    title: string;
    line: string;
    fix: ProblemFix;
}

/**
 * The one problem the sheet leads with, or null. One at a time (owner, 13
 * Oct: never stacked notes), the worst first: a payment that failed, then
 * a double charge still owed its refund, then a customer Razorpay refused.
 * A fix is offered only where an action that exists today does it: there
 * is none for a failed payment (no pay link this round, owner 18 Oct).
 */
export function problemOf(detail: SarohSubscriptionDetail): Problem | null {
    const sub = detail.subscription;
    if (sub.status === "PAST_DUE") {
        const { failures, lastAt } = failedCharges(detail.events);
        const tries =
            failures > 1
                ? `A charge failed ${failures} times.`
                : "A charge failed.";
        const last = lastAt ? ` Last try ${istDate(lastAt)}.` : "";
        return {
            title: "Payment failed",
            line: `${tries}${last} Razorpay tries again; if it gives up they drop to Free and keep their data.`,
            fix: null,
        };
    }
    const owed = detail.doubleCharges.find((d) => !d.refundedAt);
    if (owed) {
        const amount =
            owed.amountPaise !== null
                ? `${formatPaise(owed.amountPaise)} `
                : "";
        return {
            title: "A double charge is owed a refund",
            line: `${amount}was taken twice (${owed.providerPaymentId}) and the refund hasn't gone through.`,
            fix: { kind: "recheck", providerPaymentId: owed.providerPaymentId },
        };
    }
    const profile = detail.billingProfile;
    if (profile?.lastError) {
        return {
            title: "The Razorpay customer didn't sync",
            line: profile.lastError,
            fix: { kind: "sync" },
        };
    }
    return null;
}

/**
 * The charges that failed since the last one that went through, from the
 * provider's events (newest first): each `subscription.pending` is one.
 */
export function failedCharges(events: SarohSubscriptionDetail["events"]): {
    failures: number;
    lastAt: string | null;
} {
    let failures = 0;
    let lastAt: string | null = null;
    for (const e of events) {
        if (e.type === "subscription.charged") break;
        if (e.type === "subscription.pending") {
            failures += 1;
            lastAt ??= e.receivedAt;
        }
    }
    return { failures, lastAt };
}

// ── Summary facts ────────────────────────────────────────────────────────

/** "₹999.00 a month before GST", or the custom price with its end. */
export function priceLine(detail: SarohSubscriptionDetail): string {
    const { price, subscription } = detail;
    const per = subscription.billingCycle === "year" ? "a year" : "a month";
    if (price.customPaise !== null) {
        const until = price.customUntil
            ? ` until ${istDate(price.customUntil)}`
            : "";
        return `${formatPaise(price.customPaise, price.currency)} a month, custom${until} (list ${formatPaise(price.listPaise, price.currency)})`;
    }
    return `${formatPaise(price.listPaise, price.currency)} ${per} before GST`;
}

/** The autopay, and when it runs out. */
export function autopayLine(
    sub: SarohSubscriptionDetail["subscription"],
): string {
    if (sub.termPayment === "ONE_TIME") {
        return sub.termEndsAt
            ? `None: the year is paid, to ${istDate(sub.termEndsAt)}`
            : "None: the year is paid";
    }
    if (sub.nextChargeHow === "AUTOPAY") {
        return sub.termEndsAt
            ? `On · runs out ${istDate(sub.termEndsAt)}`
            : "On";
    }
    if (sub.status === "PAST_DUE") return "On · the last charge failed";
    return "Off";
}
