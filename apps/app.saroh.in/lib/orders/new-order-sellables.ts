import type { PriceTerms } from "@/lib/gst/price-mode";
import {
    effectiveMode,
    NO_GST_TERMS,
    unitPayCents,
} from "@/lib/gst/price-mode";
import type { NewOrderSellable } from "@/lib/orders/new-order";
import type {
    CatalogueProduct,
    ListStock,
    ProductListItem,
} from "@/lib/products/service";

/**
 * What New order (B13) lists for one storefront, from its catalogue rows:
 * each product as the things it can be bought as, with how many are left
 * HERE. Pure, so the counter's stock words are pinned by tests.
 *
 * A product counted per variant is read per variant (UX-026): the row's
 * own `inventory` is then the variants' sum, so "5 left" would show on a
 * sold-out size. Each variant's shelf comes from the storefront's listing.
 *
 * A price here is the amount to pay (12 Oct 2026): the API charges an order
 * line the typed price, plus its GST where the business or the product has
 * "GST is added". The sum is a preview by the API's own rule
 * (`lib/gst/price-mode.ts`); the order the API makes is the truth, and only
 * product ids and quantities are ever sent.
 */

const toCents = (money: string | null | undefined) =>
    Math.round((Number(money) || 0) * 100);

/** What is left on a shelf: on hand, less what is promised. */
function leftOf(stock: ListStock | null | undefined): number | null {
    return stock ? Math.max(0, stock.quantity - stock.promised) : null;
}

type Row = ProductListItem & Partial<Pick<CatalogueProduct, "listings">>;

/** A listed product as the things it can be bought as. */
export function sellablesOfProduct(
    p: Row,
    storeId?: string,
    /** The business's GST standing; none charges the typed price. */
    terms: PriceTerms = NO_GST_TERMS,
): NewOrderSellable[] {
    const left = leftOf(p.inventory);
    // A variant is priced under its product's rate and way.
    const mode = effectiveMode(terms.mode, p.gstPriceMode);
    const toPay = (money: string | null | undefined) =>
        unitPayCents(toCents(money), p.gstRate, mode, terms.registered);
    const markedOut = p.soldOut === true;
    if (p.variants.length === 0) {
        return [
            {
                key: p.id,
                productId: p.id,
                variantId: null,
                name: p.name,
                variantTitle: null,
                priceCents: toPay(p.price),
                left,
                soldOut: markedOut || left === 0,
            },
        ];
    }
    const listing = p.listings?.find(
        (l) => l.storeId === (storeId ?? p.storeId),
    );
    const shelves = new Map(
        (listing?.variants ?? []).map((v) => [v.variantId, v.inventory]),
    );
    // Counted per variant here: every variant reads its own shelf, and one
    // with no shelf yet has none to sell. Otherwise the product's own count.
    const perVariant = Array.from(shelves.values()).some((s) => s !== null);
    return p.variants.map((v) => {
        const own = perVariant ? (leftOf(shelves.get(v.id)) ?? 0) : left;
        return {
            key: `${p.id}:${v.id}`,
            productId: p.id,
            variantId: v.id,
            name: p.name,
            variantTitle: v.title,
            priceCents: toPay(v.price ?? p.price),
            left: own,
            soldOut: markedOut || own === 0,
        };
    });
}

/**
 * The products the counter can sell: published ones only (UX-026). A draft
 * isn't ready to sell, and an archived one is not sold (DEC-032).
 */
export function counterProducts<T extends Pick<ProductListItem, "status">>(
    products: readonly T[],
): T[] {
    return products.filter((p) => p.status === "PUBLISHED");
}
