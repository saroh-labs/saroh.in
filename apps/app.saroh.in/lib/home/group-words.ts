import { formatDay } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

import { needTitle } from "./needs";
import type {
    HomeChequesWaiting,
    HomeNeedGroup,
    HomeNeedKind,
    HomeTone,
} from "./service";

/**
 * The line each Needs you group draws on Home A (DEC-171, Home plan U6,
 * boards `HAPageD`, `HAMemberD`, `HAMondayD`): its title, the line under
 * it, and its tag. "7 orders to send or hand over", "Oldest placed 23 Sep
 * · Aditya Shetty, ₹1,020", "3 late". The API groups and counts
 * (`home-groups.ts`); this says it. What opens inside a group is U7's.
 *
 * Money only where the API sent it: a role without `payment:read` gets no
 * totals and no oldest amount, and the words leave them out (DEC-098).
 * Pure, so it is tested without a page.
 */

export interface GroupLine {
    title: string;
    /** The line under it; null when there is nothing more to say. */
    sub: string | null;
    /** "3 late", "10 overdue", "1 waiting": said in words and its tone. */
    tag: { label: string; tone: HomeTone } | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function money(group: Pick<HomeNeedGroup, "totals">): string | null {
    const totals = (group.totals ?? []).filter((t) => t.amountMinor > 0);
    if (totals.length === 0) return null;
    return totals
        .map((t) => formatMoney(t.amountMinor, t.currency))
        .join(" + ");
}

/** "12 Oct", from an instant, for "Oldest placed 23 Sep". */
function dayOf(at: string): string {
    return formatDay(at.slice(0, 10), { year: "auto" });
}

/** Whole days from `at` to `now`, at least one. */
function daysSince(at: string, now: Date): number {
    return Math.max(1, Math.floor((now.getTime() - Date.parse(at)) / DAY_MS));
}

/** The first rows' titles, as the line under a group: "A · B". */
function firstTitles(group: HomeNeedGroup, n = 2): string | null {
    const titles = group.rows.slice(0, n).map((row) => needTitle(row));
    return titles.length > 0 ? titles.join(" · ") : null;
}

const TITLES: Record<
    Exclude<HomeNeedKind, "BILLS" | "PAYMENTS" | "STOCK">,
    [string, string]
> = {
    ORDERS: ["order to send or hand over", "orders to send or hand over"],
    AWAITING_PAYMENT: ["booking awaiting payment", "bookings awaiting payment"],
    ENQUIRIES: ["enquiry to answer", "enquiries to answer"],
    REVIEWS: ["review to reply to", "reviews to reply to"],
    SETUP: ["thing to set up or fix", "things to set up or fix"],
};

/** What a payments group holds, by source: "1 payment didn't go through". */
const PAYMENT_PARTS: [codes: string[], one: string, many: string][] = [
    [
        ["PAYMENTS_FAILED_RENEWALS"],
        "payment didn't go through",
        "payments didn't go through",
    ],
    [
        ["PAYMENTS_REFUNDS_OWED", "COMMERCE_REFUNDS_FAILED"],
        "refund to make",
        "refunds to make",
    ],
    [["PAYMENTS_PAUSES_WAITING"], "pause to answer", "pauses to answer"],
];

function paymentsTitle(group: HomeNeedGroup): string {
    // Said part by part only when every row is here to count; otherwise
    // the group's own count, which is always right.
    if (group.more === 0 && group.rows.length > 0) {
        const parts = PAYMENT_PARTS.map(([codes, one, many]) => {
            const n = group.rows.filter((r) => codes.includes(r.code)).length;
            return n > 0 ? count(n, one, many) : null;
        }).filter((p): p is string => p !== null);
        if (parts.length > 0) return parts.join(", ");
    }
    return count(group.count, "payment to sort out", "payments to sort out");
}

function stockTitle(group: HomeNeedGroup): string {
    const low = group.codes.every((c) => c === "COMMERCE_STOCK_LOW");
    const short = group.codes.every((c) => c === "COMMERCE_STOCK_SHORT");
    if (low)
        return count(
            group.count,
            "product running low",
            "products running low",
        );
    if (short)
        return count(
            group.count,
            "product short for orders",
            "products short for orders",
        );
    return count(group.count, "product to restock", "products to restock");
}

/** The group's title, with its money first where it is money. */
export function groupTitle(group: HomeNeedGroup): string {
    switch (group.kind) {
        case "BILLS": {
            const bills = group.all ?? group.count;
            const amount = money(group);
            return amount
                ? `${amount} unpaid on ${count(bills, "bill")}`
                : count(bills, "unpaid bill");
        }
        case "PAYMENTS":
            return paymentsTitle(group);
        case "STOCK":
            return stockTitle(group);
        default: {
            const [one, many] = TITLES[group.kind];
            return count(group.count, one, many);
        }
    }
}

/**
 * The line under the title: the oldest for orders and bills ("Oldest
 * placed 23 Sep · Aditya Shetty, ₹1,020"), the first rows for the rest.
 */
export function groupSub(group: HomeNeedGroup, now: Date): string | null {
    const oldest = group.oldest;
    if (group.kind === "ORDERS" && oldest?.at) {
        const amount =
            oldest.amountMinor !== null
                ? formatMoney(oldest.amountMinor, oldest.currency)
                : null;
        const who = [oldest.who, amount].filter(Boolean).join(", ");
        return who
            ? `Oldest placed ${dayOf(oldest.at)} · ${who}`
            : `Oldest placed ${dayOf(oldest.at)}`;
    }
    if (group.kind === "BILLS") {
        const overdue = group.late > 0 ? `${group.late} overdue` : null;
        const left =
            group.all !== undefined && group.all > group.count
                ? `${group.all - group.count} not due yet`
                : null;
        let oldestLine: string | null = null;
        if (oldest?.at) {
            const amount =
                oldest.amountMinor !== null
                    ? formatMoney(oldest.amountMinor, oldest.currency)
                    : null;
            const days = count(daysSince(oldest.at, now), "day");
            const whose = oldest.who
                ? amount
                    ? `${oldest.who}'s ${amount}`
                    : `${oldest.who}'s`
                : amount;
            oldestLine = whose
                ? `the oldest is ${whose}, ${days}`
                : `the oldest is ${days} late`;
        }
        const parts = [overdue, oldestLine ?? left].filter(Boolean);
        return parts.length > 0 ? parts.join(" · ") : null;
    }
    return firstTitles(group);
}

/** The tag beside the group: how many are late, in words. */
export function groupTag(group: HomeNeedGroup, dueToday = 0): GroupLine["tag"] {
    if (group.late > 0) {
        switch (group.kind) {
            case "BILLS":
                return { label: `${group.late} overdue`, tone: "bad" };
            case "ENQUIRIES":
                return { label: `${group.late} waiting`, tone: "due" };
            case "ORDERS":
                return { label: `${group.late} late`, tone: "bad" };
            default:
                return null;
        }
    }
    // Nothing late yet: the orders due today are the news (`HAMondayD`).
    if (group.kind === "ORDERS" && dueToday > 0) {
        return { label: `${dueToday} due today`, tone: "due" };
    }
    return null;
}

export function groupLine(
    group: HomeNeedGroup,
    now: Date,
    dueToday = 0,
): GroupLine {
    return {
        title: groupTitle(group),
        sub: groupSub(group, now),
        tag: groupTag(group, dueToday),
    };
}

/**
 * The count beside "Needs you": "24 things", or "7 things we could check"
 * when a part couldn't be read (`HAFailedD`). Nothing for none.
 */
export function groupsCountLabel(total: number, partial: boolean): string {
    if (total <= 0) return "";
    const things = count(total, "thing");
    return partial ? `${things} we could check` : things;
}

/** "and 1 order on its way": open orders due later, beside the count. */
export function onItsWayLabel(n: number): string {
    if (n <= 0) return "";
    return n === 1
        ? "and 1 order on its way"
        : `and ${count(n, "order")} on their way`;
}

/*
 * The phone's words (DEC-171, plan U17, boards `HPHome`, `HPSheets`): one
 * line per group, said as the thing to do, shorter than the desk's, with
 * the money first where it is money. "Pack or hand over 7 orders",
 * "₹32,970 unpaid · 16 bills", "Answer 3 enquiries", "Reply to 1 review".
 * The line under it is the sheet's; the phone draws none.
 */

/** What a payments group holds, by source, on a phone: "1 payment failed". */
const PHONE_PAYMENT_PARTS: [codes: string[], one: string, many: string][] = [
    [["PAYMENTS_FAILED_RENEWALS"], "payment failed", "payments failed"],
    [
        ["PAYMENTS_REFUNDS_OWED", "COMMERCE_REFUNDS_FAILED"],
        "refund to make",
        "refunds to make",
    ],
    [["PAYMENTS_PAUSES_WAITING"], "pause to answer", "pauses to answer"],
];

function phonePaymentsTitle(group: HomeNeedGroup): string {
    if (group.more === 0 && group.rows.length > 0) {
        const parts = PHONE_PAYMENT_PARTS.map(([codes, one, many]) => {
            const n = group.rows.filter((r) => codes.includes(r.code)).length;
            return n > 0 ? count(n, one, many) : null;
        }).filter((p): p is string => p !== null);
        if (parts.length > 0) return parts.join(" · ");
    }
    return count(group.count, "payment to sort out", "payments to sort out");
}

/** The group's one line on a phone, and its sheet's title. */
export function phoneGroupTitle(group: HomeNeedGroup): string {
    switch (group.kind) {
        case "ORDERS":
            return `Pack or hand over ${count(group.count, "order")}`;
        case "BILLS": {
            const bills = group.all ?? group.count;
            const amount = money(group);
            return amount
                ? `${amount} unpaid · ${count(bills, "bill")}`
                : count(bills, "unpaid bill");
        }
        case "ENQUIRIES":
            return `Answer ${count(group.count, "enquiry", "enquiries")}`;
        case "REVIEWS":
            return `Reply to ${count(group.count, "review")}`;
        case "PAYMENTS":
            return phonePaymentsTitle(group);
        default:
            return groupTitle(group);
    }
}

/**
 * The tag at the end of a phone line: "3 late", "10 overdue", "5 due
 * today", "1 waiting 2 days". Enquiries say how long the oldest has
 * waited, as the desk's line under it would.
 */
export function phoneGroupTag(
    group: HomeNeedGroup,
    now: Date,
    dueToday = 0,
): GroupLine["tag"] {
    if (group.kind === "ENQUIRIES" && group.late > 0) {
        const at = group.oldest?.at;
        if (!at) return { label: `${group.late} waiting`, tone: "due" };
        const days = count(daysSince(at, now), "day");
        return {
            label:
                group.late === 1
                    ? `1 waiting ${days}`
                    : `${group.late} waiting up to ${days}`,
            tone: "due",
        };
    }
    return groupTag(group, dueToday);
}

/** What "Show 2 more · review, low stock" names, per group. */
export function phoneGroupName(
    group: Pick<HomeNeedGroup, "kind" | "count">,
): string {
    switch (group.kind) {
        case "ORDERS":
            return group.count === 1 ? "order" : "orders";
        case "BILLS":
            return group.count === 1 ? "bill" : "bills";
        case "AWAITING_PAYMENT":
            return "awaiting payment";
        case "ENQUIRIES":
            return group.count === 1 ? "enquiry" : "enquiries";
        case "PAYMENTS":
            return group.count === 1 ? "payment" : "payments";
        case "REVIEWS":
            return group.count === 1 ? "review" : "reviews";
        case "STOCK":
            return "low stock";
        case "SETUP":
            return "setup";
    }
}

/*
 * "Cheques not in the bank" (DEC-173, Home plan U18, boards `HAPageD`,
 * `HPHome`): one line in Needs you's money group while a cheque waits,
 * the same words at a desk and on a phone. "2 cheques not in the bank ·
 * ₹14,000", every currency said once. The amounts come only with
 * `payment:read`, as the line itself does.
 */

/** "2 cheques not in the bank · ₹14,000". */
export function chequesTitle(cheques: HomeChequesWaiting): string {
    const what = `${count(cheques.count, "cheque")} not in the bank`;
    const amount = money(cheques);
    return amount ? `${what} · ${amount}` : what;
}

/** The desk's line under it, as the invoices list says it. */
export const CHEQUES_SUB = "Received, waiting to clear";

/** The line's button: the invoices with those cheques. */
export const CHEQUES_ACTION = "See cheques";

/** The cheques line as a desk group's line: no tag, nothing late. */
export function chequesLine(cheques: HomeChequesWaiting): GroupLine {
    return { title: chequesTitle(cheques), sub: CHEQUES_SUB, tag: null };
}
