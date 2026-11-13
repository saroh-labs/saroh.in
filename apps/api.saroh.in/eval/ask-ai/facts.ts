/**
 * The right answers, read from the plan the seed wrote (`plan.ts`), never
 * typed into the questions: a question names a fact key and this resolves
 * it for the run date and the moment of the run.
 *
 * Each figure follows the rule of the tool that reports it, in words:
 * - bookings, came, no-show: standing (CONFIRMED) bookings starting in the
 *   period (`get_business_summary`).
 * - orders: placed in the period; money in: paid orders on the day paid
 *   plus bill payments on the day received (Insights' takings).
 * - owed: issued bills not paid; overdue when due before now.
 * - lapsed: last seen (a booking not missed, or an order) before now less
 *   the days; someone never seen isn't lapsed (`find_lapsed_customers`).
 * Periods are the business's calendar in Kolkata, weeks from Monday.
 */
import { DateTime } from "luxon";

import type { BizKey, BookingPlan, BusinessPlan } from "./plan";
import { dayAt, idOf, ZONE } from "./plan";

export type FactValue = number | string | string[];

const PERIODS = [
    "today",
    "tomorrow",
    "this_week",
    "last_week",
    "this_month",
] as const;
type Period = (typeof PERIODS)[number];
const DAY_MS = 86_400_000;

export function windowOf(period: string, now: Date): [Date, Date] {
    const at = DateTime.fromJSDate(now, { zone: ZONE });
    const day = at.startOf("day");
    const week = at.startOf("week");
    const month = at.startOf("month");
    const w: Record<Period, [DateTime, DateTime]> = {
        today: [day, day.plus({ days: 1 })],
        tomorrow: [day.plus({ days: 1 }), day.plus({ days: 2 })],
        this_week: [week, week.plus({ weeks: 1 })],
        last_week: [week.minus({ weeks: 1 }), week],
        this_month: [month, month.plus({ months: 1 })],
    };
    if (!(PERIODS as readonly string[]).includes(period)) {
        throw new Error(`unknown period ${period}`);
    }
    const [from, to] = w[period as Period];
    return [from.toJSDate(), to.toJSDate()];
}

const inWindow = (at: Date, [from, to]: [Date, Date]) => at >= from && at < to;
const rupees = (n: number) => Math.round(n * 100) / 100;

function orderTotal(
    biz: BusinessPlan,
    items: { product: string; qty: number }[],
) {
    const price = new Map(biz.products.map((p) => [p.key, p.price]));
    return items.reduce((n, i) => n + (price.get(i.product) ?? 0) * i.qty, 0);
}

function lastSeen(biz: BusinessPlan): Map<string, Date> {
    const seen = new Map<string, Date>();
    const see = (key: string | null, at: Date) => {
        if (!key) return;
        const was = seen.get(key);
        if (!was || at > was) seen.set(key, at);
    };
    for (const b of biz.bookings) {
        if (b.status === "CONFIRMED" && b.outcome !== "NO_SHOW")
            see(b.customer, b.start);
    }
    for (const o of biz.orders) see(o.customer, o.at);
    return seen;
}

const fullName = (p: { first: string; last: string }) => `${p.first} ${p.last}`;

/** One fact for business `biz` at `now`; throws on a key it doesn't know. */
export function resolveFact(
    biz: BusinessPlan,
    key: string,
    now: Date,
): FactValue {
    const [kind, a, b] = key.split(":");
    const confirmed = (period: string) => {
        const w = windowOf(period, now);
        return biz.bookings.filter(
            (x) => x.status === "CONFIRMED" && inWindow(x.start, w),
        );
    };
    switch (kind) {
        case "bookings":
            return confirmed(a).length;
        case "came":
            return confirmed(a).filter((x) => x.outcome === "ATTENDED").length;
        case "noshow":
            return confirmed(a).filter((x) => x.outcome === "NO_SHOW").length;
        case "staff-bookings":
            return confirmed(b).filter((x) => x.staff === a).length;
        case "names": {
            const people = new Map(
                biz.customers.map((p) => [p.key, fullName(p)]),
            );
            return [
                ...new Set(
                    confirmed(b).map(
                        (x) => people.get(x.customer) ?? x.customer,
                    ),
                ),
            ];
        }
        case "orders": {
            const w = windowOf(a, now);
            return biz.orders.filter((o) => inWindow(o.at, w)).length;
        }
        case "moneyin": {
            const w = windowOf(a, now);
            const orders = biz.orders
                .filter((o) => o.paid && inWindow(o.at, w))
                .reduce((n, o) => n + orderTotal(biz, o.items), 0);
            const bills = biz.invoices
                .filter((i) => i.paidAt && inWindow(i.paidAt, w))
                .reduce((n, i) => n + i.amount, 0);
            return rupees(orders + bills);
        }
        case "owed": {
            const open = biz.invoices.filter((i) => i.paidAt === null);
            if (a === "count") return open.length;
            if (a === "overdue")
                return open.filter((i) => i.dueAt < now).length;
            if (a === "total")
                return rupees(open.reduce((n, i) => n + i.amount, 0));
            if (a === "customer") {
                return rupees(
                    open
                        .filter((i) => i.customer === b)
                        .reduce((n, i) => n + i.amount, 0),
                );
            }
            break;
        }
        case "stock":
            return product(biz, a).onHand;
        case "low-stock":
            return biz.products
                .filter((p) => p.onHand <= p.lowAlert)
                .map((p) => p.name);
        case "lapsed": {
            const cutoff = new Date(now.getTime() - Number(a) * DAY_MS);
            return [...lastSeen(biz).values()].filter((at) => at < cutoff)
                .length;
        }
        case "phone":
            return customer(biz, a).phone;
        case "last-service": {
            const last = biz.bookings
                .filter(
                    (x) =>
                        x.customer === a &&
                        x.outcome === "ATTENDED" &&
                        x.start < now,
                )
                .reduce<BookingPlan | undefined>(
                    (best, x) => (!best || x.start > best.start ? x : best),
                    undefined,
                );
            if (!last) throw new Error(`${biz.key}: ${a} never came`);
            return (
                biz.services.find((s) => s.key === last.service)?.name ??
                last.service
            );
        }
        case "order-number": {
            const o = biz.orders.find((x) => x.key === a);
            if (!o) throw new Error(`${biz.key}: no order ${a}`);
            return o.number;
        }
        case "id":
            return idOf(biz.key, a, b);
        case "at":
            return atOf(biz, a, b);
        case "day":
            return isoAt(
                dayAt(
                    DateTime.fromJSDate(now, { zone: ZONE })
                        .startOf("day")
                        .toJSDate(),
                    Number(a),
                    clockMinute(b),
                ),
            );
    }
    throw new Error(`unknown fact ${key}`);
}

/**
 * `day:<days from today>:<HH.MM>` is a day and local time. And
 * `at:<booking key>[+days]:<HH.MM>`: that booking's day (moved on by
 * `days`) at a local time, as ISO with Kolkata's offset.
 */
function atOf(biz: BusinessPlan, ref: string, hhmm: string): string {
    const [bookingKey, plus] = ref.split("+") as [string, string?];
    const booking = biz.bookings.find((x) => x.key === bookingKey);
    if (!booking) throw new Error(`${biz.key}: no booking ${bookingKey}`);
    const anchor = DateTime.fromJSDate(booking.start, { zone: ZONE })
        .startOf("day")
        .toJSDate();
    return isoAt(dayAt(anchor, Number(plus ?? 0), clockMinute(hhmm)));
}

/** "16.00" → 960. */
function clockMinute(hhmm: string): number {
    const [h, m] = hhmm.split(".").map(Number);
    return h * 60 + m;
}

const isoAt = (at: Date) =>
    DateTime.fromJSDate(at, { zone: ZONE }).toISO({
        suppressMilliseconds: true,
    }) ?? "";

function product(biz: BusinessPlan, key: string) {
    const p = biz.products.find((x) => x.key === key);
    if (!p) throw new Error(`${biz.key}: no product ${key}`);
    return p;
}

function customer(biz: BusinessPlan, key: string) {
    const p = biz.customers.find((x) => x.key === key);
    if (!p) throw new Error(`${biz.key}: no customer ${key}`);
    return p;
}

/** `{{fact}}` in a question's words, filled from the plan. */
export function fillText(biz: BusinessPlan, text: string, now: Date): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_, key: string) =>
        String(resolveFact(biz, key.trim(), now)),
    );
}

/**
 * Every `"$fact"` string inside an expected value replaced by the fact
 * (a draft's expected input names ids and times this way).
 */
export function resolveDeep(
    biz: BusinessPlan,
    value: unknown,
    now: Date,
): unknown {
    if (typeof value === "string" && value.startsWith("$"))
        return resolveFact(biz, value.slice(1), now);
    if (Array.isArray(value)) return value.map((v) => resolveDeep(biz, v, now));
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [
                k,
                resolveDeep(biz, v, now),
            ]),
        );
    }
    return value;
}

export function businessOf(
    plan: readonly BusinessPlan[],
    key: BizKey,
): BusinessPlan {
    const biz = plan.find((b) => b.key === key);
    if (!biz) throw new Error(`no business ${key}`);
    return biz;
}
