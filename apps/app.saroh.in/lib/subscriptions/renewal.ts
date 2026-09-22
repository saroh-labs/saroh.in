import { DISPLAY_LOCALE } from "@/lib/format/locale";
import { invoiceMoney } from "@/lib/invoices/money";

import type { Interval, Renewals, Subscription } from "./service";

/**
 * How a subscription is said on screen (ADR-007, the "Saroh Billing and
 * Classes" design). Dates are read in the subscription's own timezone —
 * the one its renewals run on — so a renewal at Kolkata midnight says the
 * day it is in Kolkata.
 */

type Sub = Pick<
    Subscription,
    | "status"
    | "timezone"
    | "nextRenewalAt"
    | "startsAt"
    | "endsAt"
    | "pausedAt"
    | "cancelledAt"
    | "overdue"
    | "overdueCount"
    | "unpaidCount"
    | "unpaidTotal"
    | "currency"
    | "latestInvoice"
    | "oldestUnpaid"
>;

export type Standing = "ACTIVE" | "OVERDUE" | "PAUSED" | "CANCELLED";

const DAY = 86_400_000;

function day(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone,
        day: "numeric",
        month: "short",
    }).format(new Date(iso));
}

export function intervalWords(interval: Interval): {
    adj: string;
    per: string;
} {
    return {
        WEEK: { adj: "Weekly", per: "a week" },
        MONTH: { adj: "Monthly", per: "a month" },
        QUARTER: { adj: "Quarterly", per: "a quarter" },
        YEAR: { adj: "Yearly", per: "a year" },
    }[interval];
}

/** The tab it belongs on. Overdue wins over active and paused; cancelled is done. */
export function standing(sub: Pick<Sub, "status" | "overdue">): Standing {
    if (sub.status === "CANCELLED") return "CANCELLED";
    if (sub.overdue) return "OVERDUE";
    return sub.status;
}

/** The "Next" column: "Starts 1 Oct", "Renews 1 Oct", "Ends 1 Oct", "Paused since 5 Sep". */
export function nextLine(sub: Sub): string {
    const tz = sub.timezone;
    if (sub.status === "CANCELLED") {
        return sub.cancelledAt ? `Ended ${day(sub.cancelledAt, tz)}` : "Ended";
    }
    if (sub.status === "PAUSED") {
        return sub.pausedAt
            ? `Paused since ${day(sub.pausedAt, tz)}`
            : "Paused";
    }
    if (sub.startsAt) return `Starts ${day(sub.startsAt, tz)}`;
    if (sub.endsAt) return `Ends ${day(sub.endsAt, tz)}`;
    return sub.nextRenewalAt ? `Renews ${day(sub.nextRenewalAt, tz)}` : "—";
}

/** The day the current period ends, in its own timezone: "1 Oct". */
export function periodEndDay(
    sub: Pick<Subscription, "currentPeriodEnd" | "timezone">,
): string {
    return day(sub.currentPeriodEnd, sub.timezone);
}

/** "2 invoices overdue · ₹3,000.00", or null when nothing is overdue. */
export function owedLine(sub: Sub): string | null {
    if (!sub.overdue || sub.overdueCount === 0) return null;
    const n = sub.overdueCount;
    return `${n} ${n === 1 ? "invoice" : "invoices"} overdue · ${invoiceMoney(sub.unpaidTotal, sub.currency)}`;
}

/** Under the latest invoice's number: how late, when paid, or when due. */
export function latestInvoiceNote(
    sub: Sub,
    now: Date = new Date(),
): string | null {
    const inv = sub.latestInvoice;
    if (!inv) return null;
    if (inv.status === "PAID") {
        return inv.paidAt ? `Paid ${day(inv.paidAt, sub.timezone)}` : "Paid";
    }
    if (!inv.dueAt) return "Not paid yet";
    const late = Math.floor((now.getTime() - Date.parse(inv.dueAt)) / DAY);
    if (late > 0) return `${late} ${late === 1 ? "day" : "days"} past due`;
    return `Due ${day(inv.dueAt, sub.timezone)}`;
}

/**
 * The invoice a row points at: the oldest unpaid one while anything is
 * overdue — the one to chase first — and otherwise the latest.
 */
export function rowInvoice(
    sub: Sub,
    now: Date = new Date(),
): { id: string; number: string | null; note: string | null } | null {
    const chase = sub.overdue ? sub.oldestUnpaid : null;
    if (chase) {
        const owed = owedLine(sub);
        const { id, number } = chase;
        if (sub.overdueCount >= 2 && owed) {
            return { id, number, note: `${owed} — pause or cancel?` };
        }
        const late = chase.dueAt
            ? Math.floor((now.getTime() - Date.parse(chase.dueAt)) / DAY)
            : 0;
        return {
            id,
            number,
            note:
                late > 0
                    ? `${late} ${late === 1 ? "day" : "days"} past due`
                    : "Past due",
        };
    }
    const latest = sub.latestInvoice;
    return latest
        ? {
              id: latest.id,
              number: latest.number,
              note: latestInvoiceNote(sub, now),
          }
        : null;
}

// — What a start date means ——————————————————————————————————————

interface Ymd {
    y: number;
    m: number; // 0-11
    d: number;
}

const parse = (s: string): Ymd => {
    const [y = 1970, m = 1, d = 1] = s.split("-").map(Number);
    return { y, m: m - 1, d };
};
const toUtc = (v: Ymd) => Date.UTC(v.y, v.m, v.d);
const fromUtc = (t: number): Ymd => {
    const dt = new Date(t);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
};

/** The anchor plus `n` intervals, clamped to the end of a shorter month. */
function boundary(anchor: Ymd, interval: Interval, n: number): Ymd {
    if (interval === "WEEK") return fromUtc(toUtc(anchor) + 7 * n * DAY);
    const months = { MONTH: 1, QUARTER: 3, YEAR: 12 }[interval] * n;
    const y = anchor.y + Math.floor((anchor.m + months) / 12);
    const m = (anchor.m + months) % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return { y, m, d: Math.min(anchor.d, last) };
}

const short = (v: Ymd) =>
    new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
    }).format(new Date(toUtc(v)));

function ordinal(n: number): string {
    const tail =
        n % 100 >= 11 && n % 100 <= 13
            ? "th"
            : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
    return `${n}${tail}`;
}

/**
 * What subscribing with this start date will do, in words — the design's
 * help under "Starting". A date in the past keeps its renewal day but bills
 * only the period holding today (forward-only billing, ADR-007).
 */
export function explainStart(
    startDate: string,
    interval: Interval,
    today: string,
): string {
    const anchor = parse(startDate);
    const now = parse(today);
    let n = 0;
    if (toUtc(anchor) < toUtc(now)) {
        while (toUtc(boundary(anchor, interval, n + 1)) <= toUtc(now)) n += 1;
    }
    const start = boundary(anchor, interval, n);
    const end = fromUtc(toUtc(boundary(anchor, interval, n + 1)) - DAY);
    const span = `${short(start)} to ${short(end)}`;
    const renews =
        interval === "WEEK"
            ? `every ${new Intl.DateTimeFormat(DISPLAY_LOCALE, { timeZone: "UTC", weekday: "long" }).format(new Date(toUtc(anchor)))}`
            : `on the ${ordinal(anchor.d)}`;

    if (toUtc(anchor) > toUtc(now)) {
        return `Nothing is billed until then. The first invoice is issued on ${short(start)}, for ${span}, and it renews ${renews} after that.`;
    }
    if (n === 0) {
        return `The first invoice is issued now, for ${span}. It renews ${renews} after that.`;
    }
    const kept =
        interval === "WEEK"
            ? `It keeps ${new Intl.DateTimeFormat(DISPLAY_LOCALE, { timeZone: "UTC", weekday: "long" }).format(new Date(toUtc(anchor)))} as its renewal day.`
            : `It keeps the ${ordinal(anchor.d)} as its renewal day.`;
    return `${kept} Only the period holding today, ${span}, is invoiced now — the ${interval === "WEEK" ? "weeks" : "months"} before are not billed.`;
}

// — The renewal job ————————————————————————————————————————————

function ago(ms: number): string {
    const minutes = Math.max(1, Math.round(ms / 60_000));
    if (minutes < 60)
        return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
    const days = Math.round(hours / 24);
    return `${days} days ago`;
}

/**
 * Whether renewals are behind: never checked, or the next check is more than
 * five minutes overdue. No pending run is only normal while one is running,
 * just after the last check; any later it means the chain has stopped.
 */
export function renewalsLate(r: Renewals, now: Date = new Date()): boolean {
    if (!r.lastCheckedAt) return true;
    const dueBy = Date.parse(r.nextCheckAt ?? r.lastCheckedAt);
    return dueBy + 5 * 60_000 < now.getTime();
}

/**
 * The line over the list. There is no scheduler behind renewals, so the
 * screen says when they were last checked — silence would read the same as
 * a stopped job.
 */
export function checkedLine(r: Renewals, now: Date = new Date()): string {
    if (!r.lastCheckedAt) {
        return "Renewals have not been checked yet. Invoices go out when they are.";
    }
    const last = `Renewals last checked ${ago(now.getTime() - Date.parse(r.lastCheckedAt))}.`;
    const went =
        r.issuedToday === 0
            ? "None went out today"
            : `${r.issuedToday} ${r.issuedToday === 1 ? "invoice" : "invoices"} went out today`;
    const next = renewalsLate(r, now)
        ? "the next check is late"
        : "the next check is within the hour";
    return `${last} ${went}; ${next}.`;
}
