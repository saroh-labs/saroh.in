import type { OrderStage } from "../orders/dto";
import type { FulfilmentType } from "../orders/fulfilment";
import {
    FULFILMENT_RULES,
    stepIndexOf,
    stepsFor,
    typeOf,
} from "../orders/fulfilment";

/**
 * An order's Track, as the customer reads it on the business's site
 * (round-2 plan A, A7; Saroh Customer Site design, the Track sheet).
 *
 * The steps are the order's own fulfilment type's (`orders/fulfilment.ts`,
 * B2a): the site draws what this sends and never rebuilds them. Each step
 * is done (✓), now (●) or next (○), with its line: "At the counter — show
 * #1019" for a pick-up that is ready, the courier and its tracking number
 * once staff record them.
 *
 * A refunded or cancelled order never pretends it went further than it
 * did: the steps it reached read done, the rest are left off, and the
 * refund (or the cancel) is the last line. Pure: no Prisma, no Nest.
 */

export type TrackStepState = "done" | "now" | "next";

export interface TrackStep {
    label: string;
    state: TrackStepState;
    /** What the step means for this order, e.g. "Now · Being made". */
    line: string;
    /** The first step carries when the order was placed. */
    at: string | null;
}

/** Where the order stands, in one word for its tag. */
export type TrackState = "open" | "done" | "refunded" | "cancelled";

/** How long a refund takes to reach the customer (plan A, A7). */
export const REFUND_LINE = "Money back in 5–7 days";

export interface TrackInput {
    number: string;
    placedAt: Date;
    fulfilment: string;
    stage: string;
    status: string;
    paymentStatus: string;
    courierName: string | null;
    trackingNumber: string | null;
    /**
     * Where a pick-up is collected (UX-025): the storefront's address, when
     * it is a place customers visit and has one. Absent or null: none.
     */
    collectFrom?: string | null;
}

export interface Track {
    type: FulfilmentType;
    /** "Pick-up", "Shipping"… */
    fulfilment: string;
    state: TrackState;
    /** The tag's word: the step it is at, its done word, or Refunded. */
    status: string;
    steps: TrackStep[];
}

/** Where it stands: refunded first, then cancelled, then done or open. */
export function trackState(input: {
    fulfilment: string;
    stage: string;
    status: string;
    paymentStatus: string;
}): TrackState {
    if (input.paymentStatus === "REFUNDED") return "refunded";
    if (input.status === "CANCELLED") return "cancelled";
    const type = typeOf(input.fulfilment);
    return input.stage === FULFILMENT_RULES[type].done ||
        input.status === "DELIVERED"
        ? "done"
        : "open";
}

/** A step's line for this order, as the design words it. */
function stepLine(
    stage: OrderStage,
    label: string,
    type: FulfilmentType,
    order: TrackInput,
): string {
    const goes = type === "SHIPPING" || type === "LOCAL_DELIVERY";
    switch (stage) {
        case "NEW":
            if (type === "DIGITAL") return "Paid";
            if (FULFILMENT_RULES[type].visits) return "Booked";
            return "We have your order";
        case "PREPARING":
            return goes ? "Being made and packed" : "Being made";
        case "READY":
            if (type !== "PICKUP") return "Packed, waiting to leave";
            return order.collectFrom
                ? `Collect from ${order.collectFrom} — show #${order.number}`
                : `At the counter — show #${order.number}`;
        case "COLLECTED":
            return "Picked up";
        case "OUT_FOR_DELIVERY":
            return "On its way to you";
        case "HANDED_TO_COURIER": {
            const named = order.courierName?.trim();
            const who =
                named !== undefined && named !== "" ? named : "The courier";
            const number = order.trackingNumber?.trim();
            return number ? `${who} has it · ${number}` : `${who} has it`;
        }
        case "DELIVERED":
            return FULFILMENT_RULES[type].visits ? "Done" : "Delivered";
        case "SENT":
            return "Sent to your email";
        default:
            return label;
    }
}

/** The order's Track: its type's steps, each done, now or next. */
export function orderTrack(order: TrackInput): Track {
    const type = typeOf(order.fulfilment);
    const stage = order.stage as OrderStage;
    const all = stepsFor(type, stage);
    const at = stepIndexOf(all, stage);
    const state = trackState(order);
    const placed = order.placedAt.toISOString();

    const step = (i: number, s: TrackStepState): TrackStep => {
        const detail = stepLine(all[i].stage, all[i].label, type, order);
        return {
            label: all[i].label,
            state: s,
            line:
                s === "now"
                    ? `Now · ${detail}`
                    : s === "done"
                      ? "Done"
                      : detail,
            at: i === 0 ? placed : null,
        };
    };

    let steps: TrackStep[];
    if (state === "done") {
        steps = all.map((_, i) => step(i, "done"));
    } else if (state === "open") {
        steps = all.map((_, i) =>
            step(i, i < at ? "done" : i === at ? "now" : "next"),
        );
    } else {
        // Refunded or cancelled: only what it reached, then what happened.
        steps = all.slice(0, at + 1).map((_, i) => step(i, "done"));
        steps.push(
            state === "refunded"
                ? {
                      label: "Refunded",
                      state: "done",
                      line: REFUND_LINE,
                      at: null,
                  }
                : { label: "Cancelled", state: "done", line: "", at: null },
        );
    }

    const rule = FULFILMENT_RULES[type];
    const status =
        state === "refunded"
            ? "Refunded"
            : state === "cancelled"
              ? "Cancelled"
              : state === "done"
                ? rule.doneWord
                : all[at].label;
    return { type, fulfilment: rule.label, state, status, steps };
}
