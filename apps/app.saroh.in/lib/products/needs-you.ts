import type { CatalogueNeed } from "./service";

/**
 * "Needs you" on the Products list (#519), in words. The API decides which
 * products need restocking, across the whole catalogue (not the page on
 * screen); these say why, the same way every time. Pure and client-safe.
 */

/** Danger for someone waiting or nothing to sell; the accent for low. */
export type NeedTone = "danger" | "warn";

export interface NeedLine {
    productId: string;
    name: string;
    /** "2 short for orders already placed", "only 3 left", … */
    what: string;
    tone: NeedTone;
}

/** What a need says after the product's name. */
export function needWords(need: CatalogueNeed): NeedLine {
    const what =
        need.kind === "short"
            ? `${need.short} short for orders already placed`
            : need.kind === "out"
              ? "out of stock, customers can't buy it"
              : `only ${need.canSell} left`;
    return {
        productId: need.productId,
        name: need.name,
        what,
        tone: need.kind === "low" ? "warn" : "danger",
    };
}

/** "1 short for orders · 2 out of stock · 1 running low"; empty for none. */
export function needsSummary(needs: readonly CatalogueNeed[]): string {
    const short = needs.filter((n) => n.kind === "short").length;
    const out = needs.filter((n) => n.kind === "out").length;
    const low = needs.filter((n) => n.kind === "low").length;
    return [
        short ? `${short} short for orders` : "",
        out ? `${out} out of stock` : "",
        low ? `${low} running low` : "",
    ]
        .filter(Boolean)
        .join(" · ");
}

/** How many lines the panel shows before "and N more". */
export const NEEDS_SHOWN = 5;

/** The lines the panel shows, and how many it leaves for "Show only these". */
export function needsShown(needs: readonly CatalogueNeed[]): {
    lines: NeedLine[];
    more: number;
} {
    return {
        lines: needs.slice(0, NEEDS_SHOWN).map(needWords),
        more: Math.max(0, needs.length - NEEDS_SHOWN),
    };
}
