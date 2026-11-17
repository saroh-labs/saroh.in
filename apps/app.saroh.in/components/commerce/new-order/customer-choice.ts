import type { CustomerPick } from "@/lib/customers/picker";

/** The chip for "Walk-in" and for a pick the search no longer lists. */
export const WALK_IN = ":walk-in";
export const PICKED = ":picked";

/**
 * Which of the picker's chips is chosen: Walk-in while its form is open,
 * else the picked person — their search result when it is listed, or the
 * chip that keeps them when the search has moved on.
 */
export function chosenChip(
    value: CustomerPick | null,
    listedIds: readonly string[],
    walkIn: boolean,
): string | null {
    if (walkIn) return WALK_IN;
    if (!value) return null;
    return value.kind === "contact" && listedIds.includes(value.id)
        ? value.id
        : PICKED;
}
