import { DISPLAY_LOCALE } from "@/lib/format/locale";
import { formatMoneyMajor } from "@/lib/format/money";

import type {
    Interval,
    Plan,
    Renewals,
    Subscription,
    SubscriptionCharge,
} from "./service";

/**
 * How the Subscriptions screens say a subscription (plan 2026-09-23-003,
 * U12/U13, after "Saroh Subscriptions" and "Saroh Subscription Detail").
 * Pure: every "now" is passed in, so a server page computes the words once
 * and the client only renders them.
 */

export type ListTab = "active" | "failed" | "paused" | "cancelled";
export type Tone = "ok" | "accent" | "bad" | "off";

const DAY = 86_400_000;

/** The list tab it sits on. A failed renewal wins over running or paused. */
export function listTab(
    sub: Pick<Subscription, "status" | "paymentFailed">,
): ListTab {
    if (sub.status === "CANCELLED") return "cancelled";
    if (sub.paymentFailed) return "failed";
    return sub.status === "PAUSED" ? "paused" : "active";
}

export const TAB_LABEL: Record<ListTab, string> = {
    active: "Active",
    failed: "Payment failed",
    paused: "Paused",
    cancelled: "Cancelled",
};

export const TAB_TONE: Record<ListTab, Tone> = {
    active: "ok",
    failed: "bad",
    paused: "accent",
    cancelled: "off",
};

/** `?tab=` (the design) or `?view=` (older links; "overdue" was the old name). */
export function tabFromQuery(value: string | undefined): ListTab {
    if (value === "overdue") return "failed";
    return value === "failed" || value === "paused" || value === "cancelled"
        ? value
        : "active";
}

export function money(amount: string | number, currency: string): string {
    return formatMoneyMajor(amount, currency) ?? String(amount);
}

const PER: Record<Interval, { short: string; long: string }> = {
    WEEK: { short: "wk", long: "week" },
    MONTH: { short: "mo", long: "month" },
    QUARTER: { short: "qtr", long: "quarter" },
    YEAR: { short: "yr", long: "year" },
};

/** "₹1,200/mo" — a row's price. */
export function shortPrice(
    price: string,
    currency: string,
    interval: Interval,
): string {
    return `${money(price, currency)}/${PER[interval].short}`;
}

/** "₹1,200 / month" — the price in a sentence or a card. */
export function longPrice(
    price: string,
    currency: string,
    interval: Interval,
): string {
    return `${money(price, currency)} / ${PER[interval].long}`;
}

/**
 * About what the running subscriptions bring in a month, in the currency
 * most of them are in. An estimate by design ("about"): a yearly plan counts
 * a twelfth, a weekly one 52 twelfths.
 */
export function monthlyTotal(
    subs: readonly Pick<
        Subscription,
        "status" | "paymentFailed" | "price" | "currency" | "interval"
    >[],
): { amount: number; currency: string } | null {
    const running = subs.filter((s) => listTab(s) === "active");
    if (!running.length) return null;
    const counts: Record<string, number> = {};
    for (const s of running) counts[s.currency] = (counts[s.currency] ?? 0) + 1;
    const currency = Object.keys(counts).sort(
        (a, b) => counts[b] - counts[a],
    )[0];
    const factor: Record<Interval, number> = {
        WEEK: 52 / 12,
        MONTH: 1,
        QUARTER: 1 / 3,
        YEAR: 1 / 12,
    };
    const amount = running
        .filter((s) => s.currency === currency)
        .reduce((n, s) => n + Number(s.price) * factor[s.interval], 0);
    return { amount: Math.round(amount), currency };
}

/**
 * "20 Sep", "Sat 20 Sep", with the year when it is not this one. `at` is an
 * instant (read in `timeZone`) or a local date, YYYY-MM-DD.
 */
export function dayText(
    at: string,
    timeZone: string,
    now: Date,
    withWeekday = false,
): string {
    const local = /^\d{4}-\d{2}-\d{2}$/.test(at);
    const date = new Date(local ? `${at}T00:00:00Z` : at);
    const zone = local ? "UTC" : timeZone;
    const year = (d: Date, z: string) =>
        new Intl.DateTimeFormat("en-GB", {
            timeZone: z,
            year: "numeric",
        }).format(d);
    const sameYear = year(date, zone) === year(now, timeZone);
    const parts = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone: zone,
        day: "numeric",
        month: "short",
        ...(sameYear ? {} : { year: "numeric" }),
    })
        .format(date)
        // ICU's en-GB says "Sept"; the design, like every other month, three letters.
        .replace("Sept", "Sep");
    if (!withWeekday) return parts;
    const weekday = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone: zone,
        weekday: "short",
    }).format(date);
    return `${weekday} ${parts}`;
}

function daysLate(dueAt: string, now: Date): number {
    return Math.floor((now.getTime() - Date.parse(dueAt)) / DAY);
}

/** Why a failed renewal is failed, in words: it is not paid, and how late. */
export function failWhy(
    sub: Pick<Subscription, "failedCharge" | "currency" | "price">,
    now: Date,
): string {
    const charge = sub.failedCharge;
    if (!charge) return "The latest renewal isn't paid and is past due";
    const late = charge.dueAt ? daysLate(charge.dueAt, now) : 0;
    const amount = money(charge.total, sub.currency);
    return late > 0
        ? `Renewal of ${amount} isn't paid — ${late} ${late === 1 ? "day" : "days"} past due`
        : `Renewal of ${amount} isn't paid — past due`;
}

/** A row's line under the status: when it next charges, or why it stopped. */
export function rowWhen(
    sub: Subscription,
    now: Date,
): { text: string; danger: boolean } {
    const tz = sub.timezone;
    const tab = listTab(sub);
    if (tab === "failed") return { text: failWhy(sub, now), danger: true };
    if (tab === "cancelled") {
        return {
            text: sub.cancelledAt
                ? `Ended ${dayText(sub.cancelledAt, tz, now)}`
                : "Ended",
            danger: false,
        };
    }
    if (tab === "paused") {
        return {
            text: sub.pausedAt
                ? `Paused since ${dayText(sub.pausedAt, tz, now)}`
                : "Paused",
            danger: false,
        };
    }
    if (sub.startsAt) {
        return {
            text: `Starts ${dayText(sub.startsAt, tz, now)}`,
            danger: false,
        };
    }
    if (sub.endsAt) {
        return { text: `Ends ${dayText(sub.endsAt, tz, now)}`, danger: false };
    }
    if (sub.overdue && sub.overdueCount > 0) {
        const n = sub.overdueCount;
        return {
            text: `${n} older ${n === 1 ? "invoice" : "invoices"} overdue · ${money(sub.unpaidTotal, sub.currency)}`,
            danger: true,
        };
    }
    return {
        text: sub.nextRenewalAt
            ? `Next ${dayText(sub.nextRenewalAt, tz, now)}`
            : "—",
        danger: false,
    };
}

/** A person's initials, for the round avatar: "Nisha Kulkarni" → "NK". */
export function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase())
        .join("")
        .slice(0, 2);
}

/**
 * Whether they keep an older price: the plan sells for something else now.
 * Only said when the currencies agree — two currencies are two prices, not
 * an older one.
 */
export function olderPrice(
    sub: Pick<Subscription, "price" | "currency" | "plan">,
    plans: readonly Pick<Plan, "id" | "price" | "currency">[],
): { listPrice: string } | null {
    const plan = plans.find((p) => p.id === sub.plan.id);
    if (plan?.currency !== sub.currency) return null;
    return Number(plan.price) !== Number(sub.price)
        ? { listPrice: plan.price }
        : null;
}

/**
 * The detail page's header: the status pill, the next charge large, when,
 * and the sentence beside the actions. `how` is how the latest charge was
 * paid, when known.
 */
export function headline(
    sub: Subscription,
    how: string | null,
    now: Date,
): {
    pill: { tone: Tone; label: string };
    big: string;
    when: string;
    line: string;
} {
    const tz = sub.timezone;
    const tab = listTab(sub);
    const d = (at: string) => dayText(at, tz, now);
    const ending = tab === "active" && sub.endsAt ? sub.endsAt : null;
    const pill = ending
        ? { tone: "accent" as const, label: `Ends ${d(ending)}` }
        : { tone: TAB_TONE[tab], label: TAB_LABEL[tab] };
    const next = sub.pendingPlan ?? sub;
    if (tab === "failed") {
        const due = sub.failedCharge?.dueAt;
        return {
            pill,
            big: money(sub.failedCharge?.total ?? sub.price, sub.currency),
            when: due ? `failed ${d(due)}` : "failed",
            line: `${failWhy(sub, now)}. Nothing is collected until it's paid.`,
        };
    }
    if (tab === "paused") {
        return {
            pill,
            big: "—",
            when: "",
            line: `Paused${sub.pausedAt ? ` since ${d(sub.pausedAt)}` : ""}. Nothing is charged while paused.`,
        };
    }
    if (tab === "cancelled") {
        return {
            pill,
            big: "—",
            when: "",
            line: `Cancelled. Ended ${sub.cancelledAt ? d(sub.cancelledAt) : "at the end of its period"}. Nothing more is charged.`,
        };
    }
    if (ending) {
        return {
            pill,
            big: "—",
            when: "",
            line: `Ends ${d(ending)}. No more charges — what's paid for still happens.`,
        };
    }
    if (sub.startsAt) {
        return {
            pill,
            big: money(sub.price, sub.currency),
            when: `starts ${d(sub.startsAt)}`,
            line: `Starts ${d(sub.startsAt)}. Nothing is charged before then.`,
        };
    }
    if (!sub.nextRenewalAt) {
        return { pill, big: "—", when: "", line: "Nothing is due to renew." };
    }
    const on = d(sub.nextRenewalAt);
    return {
        pill,
        big: money(next.price, next.currency),
        when: on,
        line: `${money(next.price, next.currency)} on ${on} · ${how ? `pays by ${how}` : "invoiced with a pay link"}`,
    };
}

// — Collections ————————————————————————————————————————————————

export interface CollectionRow {
    date: string;
    label: string;
    state: "Collect" | "Skipped" | "Paused" | "On hold";
    tone: Tone;
    skipped: boolean;
    /** Skip / Undo skip offered: running, still to come. */
    canSkip: boolean;
}

export function collectionRows(sub: Subscription, now: Date): CollectionRow[] {
    const tab = listTab(sub);
    return (sub.collection?.upcoming ?? []).map((c) => {
        const state =
            tab === "failed"
                ? "On hold"
                : tab === "paused"
                  ? "Paused"
                  : c.skipped
                    ? "Skipped"
                    : "Collect";
        return {
            date: c.date,
            label: dayText(c.date, sub.timezone, now, true),
            state,
            tone:
                state === "On hold"
                    ? "bad"
                    : state === "Paused"
                      ? "off"
                      : state === "Skipped"
                        ? "accent"
                        : "ok",
            skipped: c.skipped,
            canSkip: tab === "active" && c.changeable,
        };
    });
}

// — Charges ————————————————————————————————————————————————————

export interface ChargeRow {
    id: string;
    date: string;
    result: string;
    tone: Tone;
    note: string;
    amount: string;
    number: string | null;
}

const METHOD: Record<string, string> = {
    CASH: "cash",
    UPI: "UPI",
    BANK_TRANSFER: "bank transfer",
    CARD: "card",
    ONLINE: "the pay link",
    OTHER: "another way",
};

/** Newest first: the order the charges card and the quick look read in. */
export function sortCharges(
    charges: readonly SubscriptionCharge[],
): SubscriptionCharge[] {
    return [...charges]
        .filter((c) => c.status !== "DRAFT")
        .sort((a, b) =>
            (b.issuedAt ?? b.createdAt).localeCompare(
                a.issuedAt ?? a.createdAt,
            ),
        );
}

export function chargeRow(
    c: SubscriptionCharge,
    timeZone: string,
    now: Date,
): ChargeRow {
    const [result, tone]: [string, Tone] =
        c.kind === "CREDIT_NOTE"
            ? ["Credit", "off"]
            : c.standing === "PAID"
              ? ["Paid", "ok"]
              : c.standing === "OVERDUE"
                ? ["Failed", "bad"]
                : c.standing === "ISSUED"
                  ? ["Due", "accent"]
                  : c.standing === "CREDITED"
                    ? ["Credited", "off"]
                    : ["Void", "off"];
    const period =
        c.periodStart && c.periodEnd
            ? `${dayText(c.periodStart, timeZone, now)} – ${dayText(
                  // The period's end is the next one's start: say the last day.
                  new Date(Date.parse(c.periodEnd) - 1).toISOString(),
                  timeZone,
                  now,
              )}`
            : "";
    const how =
        c.standing === "PAID" && c.payment
            ? `paid by ${METHOD[c.payment.method] ?? "hand"}`
            : c.standing === "OVERDUE" && c.dueAt
              ? `due ${dayText(c.dueAt, timeZone, now)}`
              : "";
    return {
        id: c.id,
        date: dayText(c.issuedAt ?? c.createdAt, timeZone, now),
        result,
        tone,
        note: [period, how].filter(Boolean).join(" · "),
        amount: money(c.total, c.currency),
        number: c.number,
    };
}

/** "UPI", "the pay link" — how the latest paid charge was paid, if any was. */
export function paysBy(charges: readonly SubscriptionCharge[]): string | null {
    const paid = sortCharges(charges).find(
        (c) => c.standing === "PAID" && c.payment,
    );
    return paid?.payment ? (METHOD[paid.payment.method] ?? null) : null;
}

/**
 * The GST sentence under the charges: said only from what its invoices
 * show, since a role that reads subscriptions may not read tax settings.
 */
export function gstNote(
    charges: readonly SubscriptionCharge[],
    where: "detail" | "list" = "detail",
): string {
    const issued = charges.filter((c) => c.status !== "DRAFT");
    if (!issued.length) return "";
    if (issued.some((c) => c.gst)) return "Each renewal makes a GST invoice.";
    return where === "list"
        ? "Not GST-registered — renewals make receipts."
        : "Not GST-registered — receipts, not tax invoices.";
}

// — Changes ————————————————————————————————————————————————————

export interface ChangeRow {
    what: string;
    when: string;
}

/**
 * What has changed on it, from the facts it keeps — there is no change log
 * yet, so each line is something the subscription itself records, newest
 * first. A change without a moment of its own (a booked plan change) says
 * when it takes effect instead.
 */
export function changeRows(sub: Subscription, now: Date): ChangeRow[] {
    const tz = sub.timezone;
    const rows: { at: string; row: ChangeRow }[] = [];
    if (sub.pendingPlan) {
        rows.push({
            at: "9999",
            row: {
                what: `Switching to ${sub.pendingPlan.name} (${money(sub.pendingPlan.price, sub.pendingPlan.currency)})`,
                when: `From ${dayText(sub.pendingPlan.from, tz, now)}`,
            },
        });
    }
    for (const c of sub.collection?.upcoming ?? []) {
        if (!c.skipped) continue;
        rows.push({
            at: "9998",
            row: {
                what: `Skipping ${dayText(c.date, tz, now, true)}`,
                when: "Nothing is collected that day",
            },
        });
    }
    if (sub.cancelledAt) {
        rows.push({
            at: sub.cancelledAt,
            row: { what: "Cancelled", when: dayText(sub.cancelledAt, tz, now) },
        });
    } else if (sub.endsAt) {
        rows.push({
            at: "9997",
            row: {
                what: "Set to end with its period",
                when: `Ends ${dayText(sub.endsAt, tz, now)}`,
            },
        });
    }
    if (sub.pausedAt && sub.status === "PAUSED") {
        rows.push({
            at: sub.pausedAt,
            row: { what: "Paused", when: dayText(sub.pausedAt, tz, now) },
        });
    }
    rows.push({
        at: sub.startedAt,
        row: {
            what: `Started on ${sub.plan.name} at ${money(sub.price, sub.currency)}`,
            when: dayText(sub.startedAt, tz, now),
        },
    });
    return rows.sort((a, b) => b.at.localeCompare(a.at)).map((r) => r.row);
}

// — Renewals ———————————————————————————————————————————————————

/**
 * "Renewals last ran Today, 06:00." — silence would read the same as a
 * stopped job. `late` when the next run is more than five minutes overdue,
 * or none has run.
 */
export function ranLine(
    r: Renewals,
    timeZone: string,
    now: Date,
): { text: string; late: boolean } {
    if (!r.lastCheckedAt) {
        return {
            text: "Renewals haven't run yet — invoices go out when they do.",
            late: true,
        };
    }
    const dueBy = Date.parse(r.nextCheckAt ?? r.lastCheckedAt);
    const late = dueBy + 5 * 60_000 < now.getTime();
    const last = new Date(r.lastCheckedAt);
    const key = (d: Date) =>
        new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
    const time = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(last);
    const day =
        key(last) === key(now)
            ? "Today"
            : key(last) === key(new Date(now.getTime() - DAY))
              ? "Yesterday"
              : dayText(r.lastCheckedAt, timeZone, now);
    return {
        text: late
            ? `Renewals last ran ${day}, ${time} — later than it should have; renewals wait until it runs again.`
            : `Renewals last ran ${day}, ${time}.`,
        late,
    };
}
