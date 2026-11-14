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
 * - period totals (the summary tools, spec "Changes after approval"):
 *   orders counted as placed (cancelled included, as `get_business_summary`);
 *   standing ones are those not cancelled, and the comparison with the
 *   period before is on them; their money is the totals, after discount;
 *   products and variants ordered (`top-*`) are units on orders not
 *   cancelled, by the day placed (`summarise_orders`); best sellers
 *   (`best-sellers`, `get_whats_selling`, Insights' What sells) are units
 *   on paid orders by the day paid; bills by issue date, unpaid meaning
 *   not paid now of those issued in the period; bookings by start,
 *   standing and cancelled apart.
 * - stock: per store shelf; a shelf is low at or under its alert.
 * Periods are the business's calendar in Kolkata, weeks from Monday;
 * `last_3_months` is Insights' "3m" (the day after this date three months
 * ago to today), `prev_3_months` the same number of days before it,
 * `last_month` the whole calendar month before this one.
 */
import { DateTime } from "luxon";

import type { BizKey, BookingPlan, BusinessPlan, OrderPlan } from "./plan";
import { dayAt, idOf, ZONE } from "./plan";

export type FactValue = number | string | string[];

const PERIODS = [
    "today",
    "tomorrow",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
    "last_3_months",
    "prev_3_months",
] as const;
type Period = (typeof PERIODS)[number];
const DAY_MS = 86_400_000;

export function windowOf(period: string, now: Date): [Date, Date] {
    const at = DateTime.fromJSDate(now, { zone: ZONE });
    const day = at.startOf("day");
    const week = at.startOf("week");
    const month = at.startOf("month");
    const tomorrow = day.plus({ days: 1 });
    const q = day.minus({ months: 3 }).plus({ days: 1 });
    const qDays = Math.round(tomorrow.diff(q, "days").days);
    const w: Record<Period, [DateTime, DateTime]> = {
        today: [day, day.plus({ days: 1 })],
        tomorrow: [day.plus({ days: 1 }), day.plus({ days: 2 })],
        this_week: [week, week.plus({ weeks: 1 })],
        last_week: [week.minus({ weeks: 1 }), week],
        this_month: [month, month.plus({ months: 1 })],
        last_month: [month.minus({ months: 1 }), month],
        last_3_months: [q, tomorrow],
        prev_3_months: [q.minus({ days: qDays }), q],
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
    discount = 0,
) {
    const price = new Map(biz.products.map((p) => [p.key, p.price]));
    return (
        items.reduce((n, i) => n + (price.get(i.product) ?? 0) * i.qty, 0) -
        discount
    );
}

/** Units per label (product name, or "name variant") on these orders, most first, ties by name. */
function unitsSold(
    biz: BusinessPlan,
    orders: OrderPlan[],
    byVariant: boolean,
): [string, number][] {
    const units = new Map<string, number>();
    for (const o of orders) {
        for (const i of o.items) {
            const p = product(biz, i.product);
            const v = p.variants?.find((x) => x.key === i.variant);
            const label = byVariant && v ? `${p.name} ${v.label}` : p.name;
            units.set(label, (units.get(label) ?? 0) + i.qty);
        }
    }
    return [...units].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

interface Shelf {
    label: string;
    product: string;
    variant: string | null;
    store: string;
    onHand: number;
    lowAlert: number;
}

/** Every shelf: product (and variant) at each store, with its alert. */
function shelves(biz: BusinessPlan): Shelf[] {
    return biz.products.flatMap((p): Shelf[] =>
        p.variants
            ? p.variants.flatMap((v) =>
                  Object.entries(v.stock).map(([store, onHand]) => ({
                      label: `${p.name} ${v.label}`,
                      product: p.key,
                      variant: v.key,
                      store,
                      onHand,
                      lowAlert: v.lowAlert,
                  })),
              )
            : Object.entries({ main: p.onHand, ...p.stockAt }).map(
                  ([store, onHand]) => ({
                      label: p.name,
                      product: p.key,
                      variant: null,
                      store,
                      onHand,
                      lowAlert: p.lowAlert,
                  }),
              ),
    );
}

/** A day as people write it: "Saturday 21 November". */
const dayWords = (at: Date) =>
    DateTime.fromJSDate(at, { zone: ZONE }).toFormat("cccc d LLLL");

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
    const [kind, a, b, c] = key.split(":");
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
            const placed = biz.orders.filter((o) => inWindow(o.at, w));
            if (!b) return placed.length;
            if (b === "cancelled")
                return placed.filter((o) => o.cancelled).length;
            if (b === "standing")
                return placed.filter((o) => !o.cancelled).length;
            if (b === "amount") {
                return rupees(
                    placed
                        .filter((o) => !o.cancelled)
                        .reduce(
                            (n, o) => n + orderTotal(biz, o.items, o.discount),
                            0,
                        ),
                );
            }
            // A store's key: orders placed there.
            return placed.filter((o) => (o.store ?? "main") === b).length;
        }
        case "cancelled":
            return biz.bookings.filter(
                (x) =>
                    x.status === "CANCELLED" &&
                    inWindow(x.start, windowOf(a, now)),
            ).length;
        case "invoices": {
            const issued = biz.invoices.filter((i) =>
                inWindow(i.issuedAt, windowOf(a, now)),
            );
            if (b === "count") return issued.length;
            if (b === "paid") return issued.filter((i) => i.paidAt).length;
            if (b === "unpaid") return issued.filter((i) => !i.paidAt).length;
            if (b === "amount")
                return rupees(issued.reduce((n, i) => n + i.amount, 0));
            break;
        }
        case "top-products":
        case "top-variants":
        case "best-sellers": {
            const w = windowOf(a, now);
            // best-sellers is Insights' rule (get_whats_selling): paid
            // orders, on the day paid (the seed pays on the day placed).
            const sold = unitsSold(
                biz,
                biz.orders.filter((o) =>
                    kind === "best-sellers"
                        ? o.paid && inWindow(o.at, w)
                        : !o.cancelled && inWindow(o.at, w),
                ),
                kind === "top-variants",
            );
            // Ties at the cut are in too: either is a right answer, so both are asked for.
            const cut = sold[Number(b) - 1]?.[1] ?? 0;
            return sold
                .filter(([, units], i) => i < Number(b) || units === cut)
                .map(([label]) => label);
        }
        case "low-variants":
            return [
                ...new Set(
                    shelves(biz)
                        .filter((s) => s.onHand <= s.lowAlert)
                        .map((s) => s.label),
                ),
            ];
        case "vstock": {
            const shelf = shelves(biz).find(
                (s) => s.product === a && s.variant === b && s.store === c,
            );
            if (!shelf) throw new Error(`${biz.key}: no shelf ${key}`);
            return shelf.onHand;
        }
        case "stock-summary": {
            const all = shelves(biz);
            if (a === "products") return biz.products.length;
            if (a === "units") return all.reduce((n, s) => n + s.onHand, 0);
            if (a === "low")
                return all.filter((s) => s.onHand <= s.lowAlert).length;
            if (a === "out") return all.filter((s) => s.onHand === 0).length;
            break;
        }
        case "class-booked":
            return confirmed(b).filter((x) => x.service === a).length;
        case "class-places": {
            const s = biz.services.find((x) => x.key === a);
            if (!s?.classAt) throw new Error(`${biz.key}: no class ${a}`);
            const [from, to] = windowOf(b, now);
            let sessions = 0;
            for (
                let d = DateTime.fromJSDate(from, { zone: ZONE });
                d.toJSDate() < to;
                d = d.plus({ days: 1 })
            ) {
                if (s.days.includes(d.weekday % 7))
                    sessions += s.classAt.length;
            }
            return sessions * s.capacity;
        }
        case "waitlist": {
            const list = biz.waitlists?.find((x) => x.session === a);
            if (!list) throw new Error(`${biz.key}: no waitlist ${a}`);
            return list.customers.map((k) => fullName(customer(biz, k)));
        }
        case "session-day": {
            const list = biz.waitlists?.find((x) => x.session === a);
            if (!list) throw new Error(`${biz.key}: no session ${a}`);
            return dayWords(list.start);
        }
        case "packs-expiring": {
            const w = windowOf(a, now);
            return (biz.packPurchases ?? []).filter((p) =>
                inWindow(p.expiresAt, w),
            ).length;
        }
        case "period": {
            const [from, to] = windowOf(a, now);
            const last = new Date(to.getTime() - 1);
            return isoDate(b === "to" ? last : from);
        }
        case "moneyin": {
            const w = windowOf(a, now);
            const orders = biz.orders
                .filter((o) => o.paid && inWindow(o.at, w))
                .reduce((n, o) => n + orderTotal(biz, o.items, o.discount), 0);
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
        case "customers":
            // lists.json (big lists): every contact, the customers and the people who sent an enquiry.
            return new Set([
                ...biz.customers.map((p) => p.key),
                ...biz.enquiries.map((e) => e.person.key),
            ]).size;
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

/** "2026-08-15", the day in Kolkata. */
export const isoDate = (at: Date) =>
    DateTime.fromJSDate(at, { zone: ZONE }).toISODate() ?? "";

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
