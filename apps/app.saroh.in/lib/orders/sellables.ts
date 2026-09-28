/**
 * What an order line can be for, from a storefront's catalogue — shared by
 * New order and Order Detail's "Add an item" (B8). Pure.
 */

export interface ProductLite {
    id: string;
    name: string;
    price: string;
    variants?: { id: string; title: string; price: string | null }[];
    /**
     * Nothing on the shelf at this storefront (#511): it can't be ordered
     * here. The API is the one that decides — it counts what is promised to
     * other orders too, and says "Only N left" when there are fewer than
     * asked for.
     */
    soldOut?: boolean;
}

/**
 * A product with variants is bought as one of them — "Linen Wrap Dress · M"
 * — at that variant's price, so each is its own choice; the key carries
 * both ids ("product:variant").
 */
export interface Sellable {
    key: string;
    productId: string;
    variantId?: string;
    /** The product's name. */
    name: string;
    /** The variant's title; null for a product without variants. */
    variantTitle: string | null;
    /** "Linen Wrap Dress · M". */
    label: string;
    price: string;
    soldOut: boolean;
}

export function sellablesOf(products: readonly ProductLite[]): Sellable[] {
    return products.flatMap((p): Sellable[] =>
        p.variants && p.variants.length > 0
            ? p.variants.map((v) => ({
                  key: `${p.id}:${v.id}`,
                  productId: p.id,
                  variantId: v.id,
                  name: p.name,
                  variantTitle: v.title,
                  label: `${p.name} · ${v.title}`,
                  price: v.price ?? p.price,
                  soldOut: p.soldOut ?? false,
              }))
            : [
                  {
                      key: p.id,
                      productId: p.id,
                      name: p.name,
                      variantTitle: null,
                      label: p.name,
                      price: p.price,
                      soldOut: p.soldOut ?? false,
                  },
              ],
    );
}

/** The line a new row starts on: the first thing that isn't sold out. */
export function firstSellable(products: readonly ProductLite[]): string {
    const all = sellablesOf(products);
    return (all.find((s) => !s.soldOut) ?? all.at(0))?.key ?? "";
}

/**
 * The lines "Add an item" sends: each thing picked, once, with how many
 * times it was picked — the design adds a row per pick, the order gets one
 * line per product and variant.
 */
export function addedLines(
    picked: readonly Pick<Sellable, "key" | "productId" | "variantId">[],
): { productId: string; variantId?: string; quantity: number }[] {
    const lines = new Map<
        string,
        { productId: string; variantId?: string; quantity: number }
    >();
    for (const s of picked) {
        const line = lines.get(s.key);
        if (line) line.quantity += 1;
        else
            lines.set(s.key, {
                productId: s.productId,
                ...(s.variantId ? { variantId: s.variantId } : {}),
                quantity: 1,
            });
    }
    return Array.from(lines.values());
}
