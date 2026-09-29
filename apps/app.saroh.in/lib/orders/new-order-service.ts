import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import { apiFetch } from "@/lib/api/http";
import { getInvoiceBusiness } from "@/lib/invoices/tax";
import type {
    LineAllergens,
    NewOrderPay,
    NewOrderSellable,
    NewOrderWay,
} from "@/lib/orders/new-order";
import type { ProductListItem } from "@/lib/products/service";
import { listProducts } from "@/lib/products/service";
import { getStorefront } from "@/lib/stores/storefronts";

/**
 * New order v2 (plan B, B13) for app.saroh.in: what the sheet reads for a
 * storefront, the ways its lines can leave, and the create. Server-only;
 * the sheet reaches it through Server Actions.
 */

/** A product as the sheet lists it, with each thing it can be bought as. */
export interface NewOrderProduct {
    id: string;
    name: string;
    sellables: NewOrderSellable[];
}

/** What the sheet reads when a storefront is chosen. */
export interface NewOrderCatalogue {
    currency: string;
    /**
     * The storefront's add-on tax, in basis points, when it charges one and
     * the business isn't GST-registered (a registered business's prices
     * include GST, ADR-008). Zero otherwise.
     */
    taxBps: number;
    gstRegistered: boolean;
    /** The storefront can take a payment online (for a pay link). */
    takesPayments: boolean;
    products: NewOrderProduct[];
}

const toCents = (money: string | null | undefined) =>
    Math.round((Number(money) || 0) * 100);

/** What is left at this storefront: on the shelf, less what is promised. */
function leftOf(stock: ProductListItem["inventory"]): number | null {
    return stock ? Math.max(0, stock.quantity - stock.promised) : null;
}

/** A listed product as the things it can be bought as (pure). */
export function sellablesOfProduct(p: ProductListItem): NewOrderSellable[] {
    const left = leftOf(p.inventory);
    const soldOut = p.soldOut === true || left === 0;
    if (p.variants.length === 0) {
        return [
            {
                key: p.id,
                productId: p.id,
                variantId: null,
                name: p.name,
                variantTitle: null,
                priceCents: toCents(p.price),
                left,
                soldOut,
            },
        ];
    }
    return p.variants.map((v) => ({
        key: `${p.id}:${v.id}`,
        productId: p.id,
        variantId: v.id,
        name: p.name,
        variantTitle: v.title,
        priceCents: toCents(v.price ?? p.price),
        // The list counts stock per product; the API refuses a variant it
        // can't promise, and says how many are left.
        left,
        soldOut,
    }));
}

export async function loadNewOrderCatalogue(
    storeId: string,
): Promise<NewOrderCatalogue | null> {
    const [products, storefront, business] = await Promise.all([
        listProducts({ storefront: storeId }),
        getStorefront(storeId).catch(() => null),
        getInvoiceBusiness().catch(() => null),
    ]);
    if (!storefront) return null;
    const gstRegistered = business?.registered ?? false;
    return {
        currency: storefront.currency,
        taxBps:
            storefront.taxEnabled && !gstRegistered
                ? Math.round(Number(storefront.taxRate) * 100)
                : 0,
        gstRegistered,
        takesPayments: storefront.effectiveProvider !== null,
        products: products
            // Not sold (archived): nobody orders it (DEC-032).
            .filter((p) => p.status !== "ARCHIVED")
            .map((p) => ({
                id: p.id,
                name: p.name,
                sellables: sellablesOfProduct(p),
            })),
    };
}

/** The ways these lines can leave, and their allergens (the API's). */
export interface NewOrderLines {
    ways: NewOrderWay[];
    allergens: Record<string, LineAllergens>;
}

export async function readNewOrderLines(
    storeId: string,
    productIds: readonly string[],
): Promise<NewOrderLines | null> {
    const q = new URLSearchParams();
    if (productIds.length) q.set("products", productIds.join(","));
    const res = await apiFetch(
        `/stores/${encodeURIComponent(storeId)}/orders/new-order?${q.toString()}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as NewOrderLines;
}

/** What the sheet sends. */
export interface NewOrderInput {
    items: { productId: string; variantId?: string; quantity: number }[];
    contactId?: string;
    customer?: { email: string; name?: string; phone?: string };
    walkIn?: { name: string; phone?: string };
    fulfilment: NewOrderWay["type"];
    address?: {
        name?: string;
        phone?: string;
        line1: string;
        city: string;
        state: string;
        postalCode: string;
    };
    tax?: string;
    shipping?: string;
    discount?: string;
    discountCode?: string;
    currency?: string;
    payment: { kind: NewOrderPay; received?: string };
}

export interface NewOrderMade {
    id: string;
    /** The pay link, handed over this once (B11). */
    payLink?: { url: string; payLinkCreatedAt: string };
}

export async function createNewOrder(
    storeId: string,
    input: NewOrderInput,
): Promise<ApiResult<NewOrderMade>> {
    const res = await apiFetch(
        `/stores/${encodeURIComponent(storeId)}/orders`,
        { method: "POST", body: JSON.stringify(input) },
    );
    const body: unknown = await res.json().catch(() => null);
    const made = body as Partial<NewOrderMade> | null;
    if (res.ok && typeof made?.id === "string") {
        return {
            ok: true,
            data: {
                id: made.id,
                ...(made.payLink ? { payLink: made.payLink } : {}),
            },
        };
    }
    return toFailure(body, "The order wasn't made. Try again.");
}
