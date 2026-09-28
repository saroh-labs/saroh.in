import { fromMinor, toMinor } from "../../common/money";
import type { StorefrontFulfilmentType } from "./fulfilment";
import {
    allowedTypes,
    FULFILMENT_RULES,
    STOREFRONT_FULFILMENT_TYPES,
} from "./fulfilment";

/**
 * Pricing a site's bag (round-2 G13), pure: no Nest, no Prisma. The service
 * loads the listings, shelves and settings; this decides what each line
 * costs, whether it can be sold now, which ways the order can leave and
 * what the whole comes to.
 *
 * The bag holds listing and variant ids and quantities only. Every price,
 * name and "can sell" here is re-read from the server's rows, and nothing
 * the browser sent about money is read at all.
 */

/** One line of the visitor's bag, as the site sends it. */
export interface BagLine {
    listingId: string;
    variantId: string | null;
    quantity: number;
}

/** A listing at the sells-from storefront, as the quote needs it. */
export interface QuoteListing {
    id: string;
    soldOutAt: Date | null;
    /** The variants this storefront sells. */
    variantIds: readonly string[];
    product: {
        id: string;
        slug: string;
        name: string;
        status: string;
        price: { toString(): string };
        stockTracked: boolean;
        fulfilmentTypes: readonly string[];
        cover: { url: string; alt: string } | null;
        variants: readonly {
            id: string;
            title: string;
            price: { toString(): string } | null;
        }[];
    };
}

/** A shelf at the storefront: the variant's own row, or the product's. */
export interface QuoteShelf {
    productId: string;
    variantId: string | null;
    onHand: number;
    promised: number;
}

/**
 * - ok: it can be sold as asked.
 * - short: fewer are left than asked; `available` says how many.
 * - sold-out: none can be sold now.
 * - gone: no longer sold here (unlisted, unpublished, or that option went).
 */
export type LineState = "ok" | "short" | "sold-out" | "gone";

export interface QuotedLine {
    listingId: string;
    variantId: string | null;
    /** Null when the line is gone: there is nothing to name. */
    productId: string | null;
    slug: string | null;
    name: string;
    variantTitle: string | null;
    image: { url: string; alt: string } | null;
    unitCents: number;
    quantity: number;
    state: LineState;
    /** How many can be sold, when that is a number (tracked, or sold out). */
    available: number | null;
    /** The product's own ways (B12), for `allowedTypes`. */
    fulfilmentTypes: readonly string[];
}

/** The most lines, and of each, a bag may hold. */
export const MAX_BAG_LINES = 30;
export const MAX_LINE_QUANTITY = 99;

/** The row a line sells from: the variant's own, else the whole product's. */
function shelfOf(
    shelves: readonly QuoteShelf[],
    productId: string,
    variantId: string | null,
): QuoteShelf | undefined {
    const mine = shelves.filter((s) => s.productId === productId);
    return (
        (variantId ? mine.find((s) => s.variantId === variantId) : undefined) ??
        mine.find((s) => s.variantId === null)
    );
}

/**
 * Each bag line priced from its listing, and judged: the variant's own
 * price when it has one, else the product's (`priceOrderLines`' rule).
 * "Can sell" is on hand minus promised for a product that counts stock,
 * or Sold out by hand for one that doesn't (DEC-032). Lines naming the
 * same listing and variant are joined.
 */
export function quoteLines(
    bag: readonly BagLine[],
    listings: readonly QuoteListing[],
    shelves: readonly QuoteShelf[],
    businessTracks: boolean,
): QuotedLine[] {
    const byId = new Map(listings.map((l) => [l.id, l]));
    const joined = new Map<string, BagLine>();
    for (const line of bag) {
        const key = `${line.listingId}:${line.variantId ?? ""}`;
        const before = joined.get(key);
        joined.set(key, {
            ...line,
            quantity: Math.min(
                MAX_LINE_QUANTITY,
                (before?.quantity ?? 0) + line.quantity,
            ),
        });
    }

    return [...joined.values()].map((line) => {
        const listing = byId.get(line.listingId);
        const product = listing?.product;
        // A product that isn't published is named in no public answer: the
        // visitor sees a generic line, never its name, address or photo.
        const shown = product?.status === "PUBLISHED" ? product : null;
        const gone = (name = "No longer sold here"): QuotedLine => ({
            listingId: line.listingId,
            variantId: line.variantId,
            productId: null,
            slug: shown?.slug ?? null,
            name: shown?.name ?? name,
            variantTitle: null,
            image: shown?.cover ?? null,
            unitCents: 0,
            quantity: line.quantity,
            state: "gone",
            available: 0,
            fulfilmentTypes: [],
        });
        if (!listing || product?.status !== "PUBLISHED") {
            return gone();
        }
        let variant: QuoteListing["product"]["variants"][number] | null = null;
        if (product.variants.length > 0) {
            variant =
                product.variants.find((v) => v.id === line.variantId) ?? null;
            if (!variant || !listing.variantIds.includes(variant.id)) {
                return gone();
            }
        } else if (line.variantId) {
            return gone();
        }
        const unitCents = toMinor(variant?.price ?? product.price);

        let state: LineState = "ok";
        let available: number | null = null;
        if (product.stockTracked && businessTracks) {
            const shelf = shelfOf(shelves, product.id, variant?.id ?? null);
            available = shelf ? Math.max(0, shelf.onHand - shelf.promised) : 0;
            if (available <= 0) state = "sold-out";
            else if (available < line.quantity) state = "short";
            // The public quote says how many are left only when it matters
            // ("Only 2 left"); otherwise the stock count stays private.
            if (state === "ok") available = null;
            else if (state === "sold-out") available = 0;
        } else if (listing.soldOutAt) {
            state = "sold-out";
            available = 0;
        }
        return {
            listingId: line.listingId,
            variantId: variant?.id ?? null,
            productId: product.id,
            slug: product.slug,
            name: product.name,
            variantTitle: variant?.title ?? null,
            image: product.cover,
            unitCents,
            quantity: line.quantity,
            state,
            available,
            fulfilmentTypes: product.fulfilmentTypes,
        };
    });
}

/**
 * The ways the checkout offers (default 15): the storefront's own ways
 * that every line allows (B12's `allowedTypes`). Digital follows the
 * product and needs no address; the shop doesn't sell downloads yet, so it
 * is left out here.
 */
export function checkoutWays(
    lines: readonly QuotedLine[],
    storefront: readonly StorefrontFulfilmentType[],
): StorefrontFulfilmentType[] {
    const sellable = lines.filter((l) => l.state !== "gone");
    const allowed = allowedTypes(
        sellable.map((l) => ({
            name: l.name,
            fulfilmentTypes: l.fulfilmentTypes,
        })),
        storefront,
    );
    return STOREFRONT_FULFILMENT_TYPES.filter((t) =>
        (allowed as readonly string[]).includes(t),
    );
}

/** The storefront's flat fees (G13); null is free. */
export interface DeliveryFees {
    localDeliveryFee: { toString(): string } | null;
    shippingFee: { toString(): string } | null;
}

/** What a way adds to the order, in minor units. Pick-up is free. */
export function feeCents(
    type: StorefrontFulfilmentType,
    fees: DeliveryFees,
): number {
    if (type === "LOCAL_DELIVERY" && fees.localDeliveryFee) {
        return toMinor(fees.localDeliveryFee);
    }
    if (type === "SHIPPING" && fees.shippingFee) {
        return toMinor(fees.shippingFee);
    }
    return 0;
}

/** One way as the checkout shows it. */
export interface CheckoutWay {
    type: StorefrontFulfilmentType;
    label: string;
    /** "60.00", or null when it adds nothing. */
    fee: string | null;
}

/** The quote the site's bag and checkout draw. */
export interface CheckoutQuote {
    currency: string;
    lines: {
        listingId: string;
        variantId: string | null;
        slug: string | null;
        name: string;
        variantTitle: string | null;
        image: { url: string; alt: string } | null;
        unitPrice: string;
        quantity: number;
        amount: string;
        state: LineState;
        available: number | null;
    }[];
    ways: CheckoutWay[];
    /** The way asked for, when it is one of `ways`; else null. */
    fulfilment: StorefrontFulfilmentType | null;
    subtotal: string;
    delivery: string;
    total: string;
    /** Every line can be sold and a way is chosen: it can be paid for now. */
    ready: boolean;
}

/** The whole quote, from the priced lines and the storefront's ways. */
export function buildQuote(input: {
    currency: string;
    lines: readonly QuotedLine[];
    storefrontWays: readonly StorefrontFulfilmentType[];
    fees: DeliveryFees;
    asked: StorefrontFulfilmentType | null;
}): CheckoutQuote {
    const ways = checkoutWays(input.lines, input.storefrontWays);
    const chosen =
        input.asked && ways.includes(input.asked)
            ? input.asked
            : ways.length === 1
              ? (ways[0] ?? null)
              : null;
    const counted = input.lines.filter((l) => l.state !== "gone");
    const subtotal = counted.reduce(
        (sum, l) => sum + l.unitCents * l.quantity,
        0,
    );
    const delivery = chosen ? feeCents(chosen, input.fees) : 0;
    return {
        currency: input.currency,
        lines: input.lines.map((l) => ({
            listingId: l.listingId,
            variantId: l.variantId,
            slug: l.slug,
            name: l.name,
            variantTitle: l.variantTitle,
            image: l.image,
            unitPrice: fromMinor(l.unitCents),
            quantity: l.quantity,
            amount: fromMinor(
                l.state === "gone" ? 0 : l.unitCents * l.quantity,
            ),
            state: l.state,
            available: l.available,
        })),
        ways: ways.map((type) => {
            const fee = feeCents(type, input.fees);
            return {
                type,
                label: FULFILMENT_RULES[type].label,
                fee: fee > 0 ? fromMinor(fee) : null,
            };
        }),
        fulfilment: chosen,
        subtotal: fromMinor(subtotal),
        delivery: fromMinor(delivery),
        total: fromMinor(subtotal + delivery),
        ready:
            input.lines.length > 0 &&
            input.lines.every((l) => l.state === "ok") &&
            chosen !== null,
    };
}
