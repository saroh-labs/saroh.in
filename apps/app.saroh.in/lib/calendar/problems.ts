import type { CalendarDay, CalendarItem, LayerKey } from "./types";

/**
 * The calendar's named problems (plan 005 E22, R14), after the "Saroh
 * Business Calendar" design: a day says what is wrong — "1 renewal failed",
 * "2 late orders", "1 invoice overdue", "1 no-show", or "3 need you" when
 * they are mixed — and the day panel puts the fix beside each one. Pure, so
 * the rules are tested without a browser; the grid and the panel only draw
 * them.
 */

export type ProblemKind =
    "renewal_failed" | "late_order" | "invoice_overdue" | "no_show";

/** One of a kind, and many. */
const WORDS: Record<ProblemKind, [string, string]> = {
    renewal_failed: ["renewal failed", "renewals failed"],
    late_order: ["late order", "late orders"],
    invoice_overdue: ["invoice overdue", "invoices overdue"],
    no_show: ["no-show", "no-shows"],
};

/** "YYYY-MM-DD" of the Monday on or before a day. */
function mondayOf(date: string): string {
    const [y, m, d] = date.split("-").map(Number);
    const at = new Date(Date.UTC(y, m - 1, d));
    at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));
    return at.toISOString().slice(0, 10);
}

/**
 * A no-show needs the business while it is fresh — a call, or a word about
 * the next visit — so it counts as a problem from this week's Monday to
 * today, as the design's fixtures have it. An older one is history: still
 * flagged in the panel, but not asking for anything.
 */
function noShowCounts(date: string, today: string): boolean {
    return date <= today && date >= mondayOf(today);
}

/** What is wrong with one dated thing, if anything. */
export function problemOf(
    layer: LayerKey,
    item: CalendarItem,
    { date, today }: { date: string; today: string },
): ProblemKind | null {
    switch (layer) {
        case "subscriptions":
            return item.kind === "failed" ? "renewal_failed" : null;
        case "invoices":
            return item.kind === "overdue" ? "invoice_overdue" : null;
        case "orders":
            return item.flags?.includes("late") ? "late_order" : null;
        case "bookings":
            return (item.kind === "no_show" ||
                item.flags?.includes("no_show")) &&
                noShowCounts(date, today)
                ? "no_show"
                : null;
        default:
            return null;
    }
}

/**
 * How many of each problem a day holds, among the layers switched on. The
 * kinds the API counts (failed, overdue, no-show) come from its true
 * counts; a late order is a flag, so it is counted on the items read.
 */
export function dayProblems(
    day: CalendarDay,
    off: Partial<Record<LayerKey, boolean>>,
    today: string,
): Partial<Record<ProblemKind, number>> {
    const out: Partial<Record<ProblemKind, number>> = {};
    const add = (kind: ProblemKind, n: number) => {
        if (n > 0) out[kind] = (out[kind] ?? 0) + n;
    };
    if (!off.subscriptions) {
        add("renewal_failed", day.layers.subscriptions?.kinds.failed ?? 0);
    }
    if (!off.invoices) {
        add("invoice_overdue", day.layers.invoices?.kinds.overdue ?? 0);
    }
    if (!off.orders) {
        add(
            "late_order",
            (day.layers.orders?.items ?? []).filter((i) =>
                i.flags?.includes("late"),
            ).length,
        );
    }
    if (!off.bookings && noShowCounts(day.date, today)) {
        add("no_show", day.layers.bookings?.kinds.no_show ?? 0);
    }
    return out;
}

/** The day's chip: its one kind named, or "N need you" when mixed; "" for none. */
export function problemChip(
    counts: Partial<Record<ProblemKind, number>>,
): string {
    const kinds = (Object.keys(counts) as ProblemKind[]).filter(
        (k) => (counts[k] ?? 0) > 0,
    );
    const n = kinds.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
    if (n === 0) return "";
    if (kinds.length > 1) return `${n} need you`;
    const [one, many] = WORDS[kinds[0]];
    return `${n} ${n === 1 ? one : many}`;
}

/** What this person may do about a problem (the page reads their actions). */
export interface ProblemCan {
    /** `invoice:write`: send the invoice's reminder (D17). */
    remind: boolean;
    /**
     * `subscription:write`: retry a failed renewal (D13) — by their autopay
     * or a new pay link, as its subscription offers.
     */
    retry?: boolean;
}

/**
 * The fix the day panel offers beside a problem, in the design's words. An
 * action this person cannot take — or one not live yet — is not offered;
 * opening the record is, since whoever sees the layer reads it.
 */
export function problemAction(
    kind: ProblemKind,
    { can, shop }: { can: ProblemCan; shop: boolean },
): string {
    switch (kind) {
        // "Retry charge" opens the subscription, where Retry charges their
        // autopay again or makes a new pay link (D13), for whoever may
        // write subscriptions; anyone else opens it to read.
        case "renewal_failed":
            if (can.retry) return "Retry charge";
            return shop ? "Open subscription" : "Open membership";
        case "invoice_overdue":
            return can.remind ? "Send a reminder" : "Open invoice";
        case "late_order":
            return "Open order";
        case "no_show":
            return "Open the booking";
    }
}
