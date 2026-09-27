import { DateTime } from "luxon";

import { DEFAULT_LATE_AFTER_MINUTES } from "../orders/order-list-filters";
import type { HomeTone } from "./home-model";
import { placedWords } from "./home-needs";

/**
 * What an open order says on Needs you (F3): what to do with it, whether it
 * is late, and when it was placed. Pure.
 *
 * Late is the Orders list's rule (`lateSql`), said here for one row: an
 * order not yet handed over, placed longer ago than its fulfilment's
 * threshold (DEC-045). The two read the same thresholds, so Home and the
 * Orders list's Late filter never disagree about an order.
 */

export interface OpenOrderFacts {
    orderId: string;
    createdAt: Date;
    /** Absent in an old fixture: read as neither late nor due. */
    status?: string;
    paymentStatus?: string;
    stage?: string;
    fulfilment?: string;
}

export interface OrderWords {
    headline: string;
    detail: string;
    tag: string | undefined;
    tone: HomeTone;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const NOT_HANDED_OVER = ["NEW", "PREPARING", "READY"];

/** "#1042" for a storefront's number, and "ORD-001" as it is. */
export function orderNumber(orderId: string): string {
    return /^\d/.test(orderId) ? `#${orderId}` : orderId;
}

/** Minutes after placing an order turns late, or null when it never does. */
function lateAfter(order: OpenOrderFacts): number | null {
    if (!order.fulfilment) return null;
    if (order.stage && !NOT_HANDED_OVER.includes(order.stage)) return null;
    if (order.paymentStatus === "REFUNDED") return null;
    return DEFAULT_LATE_AFTER_MINUTES[order.fulfilment] ?? null;
}

/** "Late · 3 h" under a day, "Late · 2 days" after, from when it was placed. */
function lateTag(placed: Date, now: Date): string {
    const ms = now.getTime() - placed.getTime();
    if (ms < DAY_MS) return `Late · ${Math.max(1, Math.floor(ms / HOUR_MS))} h`;
    const days = Math.floor(ms / DAY_MS);
    return `Late · ${days} day${days === 1 ? "" : "s"}`;
}

/** "Due today", "Due tomorrow", "Due in 2 days", by the business's days. */
function dueTag(deadline: Date, now: Date, zone: string): string {
    const due = DateTime.fromJSDate(deadline, { zone }).startOf("day");
    const today = DateTime.fromJSDate(now, { zone }).startOf("day");
    const days = Math.round(due.diff(today, "days").days);
    if (days <= 0) return "Due today";
    if (days === 1) return "Due tomorrow";
    return `Due in ${days} days`;
}

/** What to do with the order, by how it reaches the customer. */
function headline(order: OpenOrderFacts, who: string): string {
    const n = orderNumber(order.orderId);
    if (order.fulfilment === "COLLECT" || order.fulfilment === "PICKUP") {
        return order.stage === "READY"
            ? `Hand over order ${n} to ${who}`
            : `Get order ${n} ready for ${who}`;
    }
    return `Send order ${n} to ${who}`;
}

export function openOrderWords(
    order: OpenOrderFacts,
    customer: string | null,
    now: Date,
    zone: string,
): OrderWords {
    const after = lateAfter(order);
    const deadline =
        after === null
            ? null
            : new Date(order.createdAt.getTime() + after * 60_000);
    const late = deadline !== null && deadline < now;
    return {
        headline: headline(order, customer ?? "a customer"),
        detail: placedWords(order.createdAt.toISOString(), now, zone),
        tag: late
            ? lateTag(order.createdAt, now)
            : deadline
              ? dueTag(deadline, now, zone)
              : undefined,
        tone: late ? "bad" : "due",
    };
}
