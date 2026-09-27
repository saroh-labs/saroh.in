import { DateTime } from "luxon";

import type { LateFacts, LateThresholds } from "../orders/fulfilment";
import { lateOf, typeOf } from "../orders/fulfilment";
import type { HomeTone } from "./home-model";
import { placedWords } from "./home-needs";

/**
 * What an open order says on Needs you (F3): what to do with it, whether it
 * is late, and when it was placed. Pure.
 *
 * Late is `lateOf`, the rule Order Detail, the Orders list's rows and its
 * Late filter (`lateSql`) run: an open order not yet handed over, placed
 * longer ago than the threshold its storefront sets for its type (B17;
 * DEC-045). All of them read the same storefront's thresholds, so Home and
 * Orders never disagree about an order.
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

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** A moment every threshold has passed by (30 days is the longest). */
const EVENTUALLY = new Date(8.64e15);

/** "#1042" for a storefront's number, and "ORD-001" as it is. */
export function orderNumber(orderId: string): string {
    return /^\d/.test(orderId) ? `#${orderId}` : orderId;
}

/** What `lateOf` reads, or null for an old fixture missing any of it. */
function factsOf(order: OpenOrderFacts): LateFacts | null {
    if (!order.fulfilment || !order.stage || !order.status) return null;
    return {
        fulfilment: order.fulfilment,
        stage: order.stage,
        status: order.status,
        paymentStatus: order.paymentStatus ?? "UNPAID",
        placedAt: order.createdAt,
    };
}

/**
 * Whether the order is late now, and, if not, when it turns late — only for
 * an order that will, left as it is (open, not handed over, a type with a
 * threshold).
 */
function lateness(
    order: OpenOrderFacts,
    now: Date,
    thresholds?: LateThresholds,
): { late: boolean; deadline: Date | null } {
    const facts = factsOf(order);
    if (!facts) return { late: false, deadline: null };
    const today = lateOf(facts, now, thresholds);
    if (today.late) return { late: true, deadline: null };
    if (
        today.lateAfterMinutes === null ||
        !lateOf(facts, EVENTUALLY, thresholds).late
    ) {
        return { late: false, deadline: null };
    }
    return {
        late: false,
        deadline: new Date(
            order.createdAt.getTime() + today.lateAfterMinutes * MINUTE_MS,
        ),
    };
}

/**
 * "Late · 25 min" under an hour, "Late · 3 h" under a day, "Late · 2 days"
 * after, from when it was placed (the Home design's words; minutes because a
 * counter's threshold can be 20 of them).
 */
function lateTag(placed: Date, now: Date): string {
    const ms = now.getTime() - placed.getTime();
    if (ms < HOUR_MS) {
        return `Late · ${Math.max(1, Math.floor(ms / MINUTE_MS))} min`;
    }
    if (ms < DAY_MS) return `Late · ${Math.floor(ms / HOUR_MS)} h`;
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
    if (order.fulfilment && typeOf(order.fulfilment) === "PICKUP") {
        return order.stage === "READY"
            ? `Hand over order ${n} to ${who}`
            : `Get order ${n} ready for ${who}`;
    }
    return `Send order ${n} to ${who}`;
}

/**
 * `thresholds` are the order's storefront's (B17); without them, the
 * defaults every storefront starts on.
 */
export function openOrderWords(
    order: OpenOrderFacts,
    customer: string | null,
    now: Date,
    zone: string,
    thresholds?: LateThresholds,
): OrderWords {
    const { late, deadline } = lateness(order, now, thresholds);
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
