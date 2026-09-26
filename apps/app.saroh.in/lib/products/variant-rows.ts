import { isMoney, LIMITS, trimMoney } from "./editor-sections";
import type { ProductOptionView, Variant } from "./service";

/**
 * The Editor's Variants list, as it stages rows (#468, #525) — pure and
 * client-safe; tested in `variant-rows.test.ts`.
 */

/** One variant as the list stages it; `id` once it is saved. */
export interface VariantRow {
    key: string;
    id?: string;
    valueId: string;
    /**
     * A saved variant's own title when it has no value from Settings →
     * Options — an older variant, made before options. It keeps it until a
     * value is picked.
     */
    legacyTitle: string;
    sku: string;
    price: string;
    /** Carried through unchanged: the list does not edit them. */
    mrp: string | null;
    image: string | null;
    imageId: string;
    /** The storefronts that sell it ("Sell it at"); [] with one storefront. */
    stores: string[];
}

export function rowsFrom(
    variants: Variant[],
    option: Pick<ProductOptionView, "values"> | null,
    soldAt: Partial<Record<string, string[]>> = {},
): VariantRow[] {
    return [...variants]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((v) => {
            const byTitle = option?.values.find((x) => x.value === v.title);
            const valueId = v.optionValueId ?? byTitle?.id ?? "";
            return {
                key: v.id,
                id: v.id,
                valueId,
                legacyTitle: valueId ? "" : v.title,
                sku: v.sku,
                price: v.price ? trimMoney(v.price) : "",
                mrp: v.mrp ?? null,
                image: v.image,
                imageId: v.imageId ?? "",
                stores: soldAt[v.id] ?? [],
            };
        });
}

const sameStores = (a: string[], b: string[]) =>
    a.length === b.length && a.every((s) => b.includes(s));

export function sameRows(a: VariantRow[], b: VariantRow[]): boolean {
    return (
        a.length === b.length &&
        a.every((r, i) => {
            const o = b.at(i);
            return (
                !!o &&
                r.key === o.key &&
                r.valueId === o.valueId &&
                r.legacyTitle === o.legacyTitle &&
                r.sku === o.sku &&
                r.price === o.price &&
                r.imageId === o.imageId &&
                sameStores(r.stores, o.stores)
            );
        })
    );
}

/** A saved variant still on its own title, with no value picked. */
export function isLegacy(r: VariantRow): boolean {
    return !!r.id && !r.valueId && r.legacyTitle.trim() !== "";
}

/**
 * What a row must fix before the list can save, or "". A legacy variant is
 * not a fault: it keeps its title until someone picks a value (#525) — it
 * only has to be distinct and have a SKU, like every row.
 */
export function variantProblem(
    r: VariantRow,
    rows: readonly VariantRow[],
    ctx: {
        /** "size" — the option's name, lower case. */
        opt: string;
        title: (r: VariantRow) => string;
        /** Why the price is above the MRP, or "" when it isn't. */
        overMrp: (r: VariantRow) => string;
    },
): string {
    const title = ctx.title(r);
    if (!r.valueId && !isLegacy(r)) {
        return title
            ? `“${title}” is not a ${ctx.opt} in Settings → Options. Pick one, or add it there.`
            : `Pick a ${ctx.opt}.`;
    }
    const twin = rows.some(
        (x) =>
            x.key !== r.key &&
            (r.valueId
                ? x.valueId === r.valueId
                : !x.valueId && ctx.title(x) === title),
    );
    if (twin) return `Two variants are both ${title}.`;
    if (!r.sku.trim()) return "Needs a SKU.";
    if (r.sku.length > LIMITS.sku)
        return `A SKU is at most ${LIMITS.sku} characters.`;
    const sku = r.sku.trim().toLowerCase();
    if (rows.some((x) => x.key !== r.key && x.sku.trim().toLowerCase() === sku))
        return "Another variant already has this SKU.";
    if (r.price.trim() && !isMoney(r.price))
        return "Price: a number with at most two decimals, or blank to use the product's.";
    const mrp = ctx.overMrp(r);
    if (mrp) return `Price: ${mrp}`;
    return "";
}

/** The quiet line under a legacy variant: why it has no value yet. */
export function legacyNote(title: string, opt: string): string {
    return `Kept as “${title}” until you pick a ${opt}.`;
}
