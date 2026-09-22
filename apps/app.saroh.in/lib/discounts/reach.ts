import type { DiscountReach } from "./service";

/** What each narrow mode has picked. Kept apart so switching back restores. */
export type Selections = Record<Exclude<DiscountReach, "BUSINESS">, string[]>;

export const NO_SELECTIONS: Selections = {
    STOREFRONT: [],
    COLLECTION: [],
    PRODUCT: [],
};

/**
 * The reach the API is sent: the mode, and ONLY that mode's picks. The whole
 * business sends none — choosing it clears targets rather than hiding them.
 */
export function toReach(
    mode: DiscountReach,
    selections: Selections,
): { appliesTo: DiscountReach; targetIds: string[] } {
    return {
        appliesTo: mode,
        targetIds:
            mode === "BUSINESS" ? [] : Array.from(new Set(selections[mode])),
    };
}

/** An existing code's reach, back into the form's shape. */
export function fromReach(
    mode: DiscountReach,
    targetIds: string[],
): Selections {
    return mode === "BUSINESS"
        ? NO_SELECTIONS
        : { ...NO_SELECTIONS, [mode]: targetIds };
}

/**
 * A picked day as the moment a code starts: its first instant, in the
 * viewer's own timezone — the merchant means "from the 1st" where they are.
 */
export function startOfDay(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

/** A picked day as the moment a code ends: its last instant, locally. */
export function endOfDay(date: Date): string {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
}
