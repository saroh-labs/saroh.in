import type { DiscountWindow } from "./discount-state";
import { discountState } from "./discount-state";

export const DISCOUNT_KINDS = ["PERCENTAGE", "FIXED_AMOUNT"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

export const DISCOUNT_REACH = [
    "BUSINESS",
    "STOREFRONT",
    "COLLECTION",
    "PRODUCT",
] as const;
export type DiscountReach = (typeof DISCOUNT_REACH)[number];

/** A code, with its reach already resolved to ids and its use counted. */
export interface RedeemableDiscount extends DiscountWindow {
    kind: DiscountKind;
    percentBps: number | null;
    amountCents: number | null;
    currency: string | null;
    appliesTo: DiscountReach;
    storeIds: string[];
    /**
     * Collection ids, already resolved by the caller — whether a collection
     * includes its children is decided there, not here.
     */
    categoryIds: string[];
    productIds: string[];
    used: number;
}

export interface OrderLineView {
    productId: string;
    categoryId: string | null;
    unitCents: number;
    quantity: number;
}

export interface OrderView {
    storeId: string;
    currency: string;
    lines: OrderLineView[];
}

/**
 * Why a code took nothing off. A closed set, so the caller turns each into a
 * sentence without matching strings. "Nothing off" and "does not apply here"
 * are different facts, so no refusal is ever an amount of zero.
 */
export type RedeemRefusal =
    | "SCHEDULED"
    | "EXPIRED"
    | "EXHAUSTED"
    | "STOREFRONT"
    | "CURRENCY"
    | "NO_MATCH";

export type RedeemResult =
    { ok: true; amountCents: number } | { ok: false; reason: RedeemRefusal };

/**
 * Does this code apply to this order, and what comes off?
 *
 * Pure: no database, no clock of its own, integer cents throughout — so a
 * future cart can call the same decision the merchant's order form does.
 *
 * `appliesTo` decides reach, never the number of reach ids: a STOREFRONT code
 * whose storefronts were all deleted reaches nothing and refuses, rather than
 * reading as business-wide and taking money off everything.
 */
export function redeem(
    discount: RedeemableDiscount,
    order: OrderView,
    now: Date,
): RedeemResult {
    const state = discountState(discount, discount.used, now);
    if (state !== "ACTIVE") return { ok: false, reason: state };

    if (
        discount.appliesTo === "STOREFRONT" &&
        !discount.storeIds.includes(order.storeId)
    ) {
        return { ok: false, reason: "STOREFRONT" };
    }
    if (
        discount.kind === "FIXED_AMOUNT" &&
        discount.currency !== order.currency
    ) {
        return { ok: false, reason: "CURRENCY" };
    }

    const eligible = order.lines.filter((line) => {
        switch (discount.appliesTo) {
            case "BUSINESS":
            case "STOREFRONT":
                return true;
            case "COLLECTION":
                return (
                    line.categoryId !== null &&
                    discount.categoryIds.includes(line.categoryId)
                );
            case "PRODUCT":
                return discount.productIds.includes(line.productId);
        }
    });
    if (eligible.length === 0) return { ok: false, reason: "NO_MATCH" };

    const subtotal = eligible.reduce(
        (sum, l) => sum + l.unitCents * l.quantity,
        0,
    );

    if (discount.kind === "PERCENTAGE") {
        // Summed FIRST, rounded ONCE, half up. Rounding each line and
        // summing gives a different answer on a multi-line order.
        const bps = discount.percentBps ?? 0;
        return {
            ok: true,
            amountCents: Math.floor((subtotal * bps + 5_000) / 10_000),
        };
    }
    return {
        ok: true,
        amountCents: Math.max(0, Math.min(discount.amountCents ?? 0, subtotal)),
    };
}

/** The refusal, as a sentence for the merchant typing the code. */
export function refusalMessage(code: string, reason: RedeemRefusal): string {
    switch (reason) {
        case "SCHEDULED":
            return `${code} has not started yet.`;
        case "EXPIRED":
            return `${code} has ended.`;
        case "EXHAUSTED":
            return `${code} has been used as many times as it allows.`;
        case "STOREFRONT":
            return `${code} is not honoured at this storefront.`;
        case "CURRENCY":
            return `${code} is an amount in another currency.`;
        case "NO_MATCH":
            return `${code} does not apply to anything on this order.`;
    }
}
