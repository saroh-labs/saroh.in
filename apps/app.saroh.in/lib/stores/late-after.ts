import type { StorefrontFulfilmentType } from "./fulfilment-types";

/**
 * "Mark pick-up orders late after [N] [hours ▾]" (plan B, B17): a storefront's
 * late thresholds as the field shows them. Stored in whole minutes; shown in
 * hours, and in minutes when the value isn't a whole number of hours. The
 * bounds are the API's: 5 minutes to 30 days.
 *
 * Pure, so the rules are tested without a screen.
 */

export type LateUnit = "hours" | "minutes";

export const LATE_AFTER_MIN_MINUTES = 5;
export const LATE_AFTER_MAX_MINUTES = 30 * 24 * 60;

/** The defaults every storefront starts on (default 16). */
export const DEFAULT_LATE_AFTER = {
    PICKUP: 120,
    LOCAL_DELIVERY: 1440,
    SHIPPING: 2880,
} as const satisfies Record<StorefrontFulfilmentType, number>;

/** The chip's name for each way an order leaves. */
export const FULFILMENT_LABEL: Record<StorefrontFulfilmentType, string> = {
    PICKUP: "Pick-up",
    LOCAL_DELIVERY: "Local delivery",
    SHIPPING: "Shipping",
};

/** What each way's orders are called in a sentence. */
export const ORDERS_NOUN: Record<StorefrontFulfilmentType, string> = {
    PICKUP: "pick-up orders",
    LOCAL_DELIVERY: "local delivery orders",
    SHIPPING: "shipping orders",
};

/** A stored value as the field shows it. */
export function lateAfterField(minutes: number): {
    amount: string;
    unit: LateUnit;
} {
    return minutes % 60 === 0
        ? { amount: String(minutes / 60), unit: "hours" }
        : { amount: String(minutes), unit: "minutes" };
}

/**
 * The field's value in minutes, or why it can't be saved — the API's own
 * sentences, so the screen says the same before and after a round trip.
 */
export function lateAfterMinutes(
    amount: string,
    unit: LateUnit,
): { ok: true; minutes: number } | { ok: false; error: string } {
    const text = amount.trim();
    if (!/^\d+$/.test(text)) {
        return {
            ok: false,
            error:
                unit === "hours"
                    ? "A whole number of hours. For part of an hour, choose minutes."
                    : "A whole number of minutes.",
        };
    }
    const minutes = Number(text) * (unit === "hours" ? 60 : 1);
    if (minutes < LATE_AFTER_MIN_MINUTES) {
        return { ok: false, error: "5 minutes at the soonest." };
    }
    if (minutes > LATE_AFTER_MAX_MINUTES) {
        return { ok: false, error: "30 days at the most." };
    }
    return { ok: true, minutes };
}

/** "2 hours", "1 hour", "20 minutes", "90 minutes". */
export function lateAfterWords(minutes: number): string {
    const { amount, unit } = lateAfterField(minutes);
    const n = Number(amount);
    return `${amount} ${n === 1 ? unit.slice(0, -1) : unit}`;
}
