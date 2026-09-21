/**
 * Where a discount code stands at a moment — the one rule, next to the clock
 * the redemption path also uses. The screen renders what the API computes
 * here; nothing re-derives it.
 *
 * EXHAUSTED and EXPIRED read the same to a merchant ("it will not work now")
 * and are drawn with one pill, but only one of them is fixed by changing a
 * date, so the API keeps them apart.
 */
export const DISCOUNT_STATES = [
    "SCHEDULED",
    "ACTIVE",
    "EXPIRED",
    "EXHAUSTED",
] as const;
export type DiscountState = (typeof DISCOUNT_STATES)[number];

export interface DiscountWindow {
    startsAt: Date | null;
    endsAt: Date | null;
    usageLimit: number | null;
}

/**
 * The clock is a parameter, never `new Date()` in here, so every boundary is
 * testable. The window is inclusive: a code is live at the first instant of
 * `startsAt` and at the last instant of `endsAt`.
 */
export function discountState(
    window: DiscountWindow,
    used: number,
    now: Date,
): DiscountState {
    if (window.startsAt && now < window.startsAt) return "SCHEDULED";
    // The date is the stronger fact: an ended code that also hit its cap is
    // Expired, because that is the one a merchant would change.
    if (window.endsAt && now > window.endsAt) return "EXPIRED";
    if (window.usageLimit !== null && used >= window.usageLimit) {
        return "EXHAUSTED";
    }
    return "ACTIVE";
}
