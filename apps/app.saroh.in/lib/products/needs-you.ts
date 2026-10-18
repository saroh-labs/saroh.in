import type { CatalogueNeed } from "./service";

/**
 * "Needs you" on the Products list (#519), in words. The API decides which
 * products need restocking, across the whole catalogue (not the page on
 * screen) — never a draft nobody can buy yet, never an archived one; these
 * say why, the same way every time. Pure and client-safe.
 */

/**
 * A need as the API sends it now: the option word, how many variants and
 * which storefronts are the worst (absent from an older API).
 */
export interface NeedDetail extends CatalogueNeed {
    /** "Shade", "Size"; null when the product has no option. */
    option?: string | null;
    /** How many of its variants are `kind`, of how many sold. */
    variants?: { worst: number; of: number };
    /** The storefronts where it is `kind`, when not all of them are. */
    places?: string[];
}

/** Danger for someone waiting or nothing to sell; the accent for low. */
export type NeedTone = "danger" | "warn";

export interface NeedLine {
    productId: string;
    name: string;
    /** "2 short for orders already placed", "Out: Small at Online", … */
    what: string;
    tone: NeedTone;
}

/**
 * What a need says after the product's name. The API judges each shelf
 * where it sells, as the Stock screen does; when only some shelves need
 * someone, it names them: "Out: Small at Online".
 */
export function needWords(need: NeedDetail): NeedLine {
    const where = need.where?.length ? need.where.join(", ") : null;
    const what =
        need.kind === "short"
            ? `${need.short} short for orders already placed` +
              (where ? ` (${where})` : "")
            : need.kind === "out"
              ? where
                  ? `Out: ${where}`
                  : "Out of stock"
              : where
                ? `Low: ${where} (${need.canSell} left)`
                : `Only ${need.canSell} left`;
    return {
        productId: need.productId,
        name: need.name,
        what,
        tone: need.kind === "low" ? "warn" : "danger",
    };
}

/** "2 short · 7 out · 21 low"; empty for none. */
export function needsSummary(needs: readonly CatalogueNeed[]): string {
    const short = needs.filter((n) => n.kind === "short").length;
    const out = needs.filter((n) => n.kind === "out").length;
    const low = needs.filter((n) => n.kind === "low").length;
    return [
        short ? `${short} short` : "",
        out ? `${out} out` : "",
        low ? `${low} low` : "",
    ]
        .filter(Boolean)
        .join(" · ");
}

/**
 * How many lines the folded panel shows on a desk: the worst two (the API
 * sends them most urgent first). A phone shows the one line only.
 */
export const NEEDS_PREVIEW = 2;

/** The lines the panel shows: the worst two folded, every one open. */
export function needsShown(
    needs: readonly CatalogueNeed[],
    open: boolean,
): NeedLine[] {
    return (open ? needs : needs.slice(0, NEEDS_PREVIEW)).map(needWords);
}

/** The need for one product, if it has one. */
export function needOf(
    needs: readonly NeedDetail[],
    productId: string,
): NeedDetail | null {
    return needs.find((n) => n.productId === productId) ?? null;
}

/** "shade" → "shades"; a word for the option, lower case. */
export function optionWord(option: string | null | undefined, n: number) {
    const word = option?.trim() ?? "";
    const one = (word.length > 0 ? word : "variant").toLowerCase();
    if (n === 1) return one;
    return /(s|x|z|ch|sh)$/.test(one) ? `${one}es` : `${one}s`;
}
