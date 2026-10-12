import type { StockWord } from "@saroh/site-blocks";
import { gstOnPriceOf, shownSaving } from "@saroh/site-blocks";

import type { CatalogueProduct } from "./catalogue-shape";

/**
 * A shop product page's `Product` structured data (#473), built only from
 * what the page itself shows a visitor: the public catalogue answer, which
 * never carries cost, stock counts beyond "Only N left", team-only fields or
 * a hidden review. Nothing here names Saroh — the seller is the merchant.
 * An offer's price is what the customer pays: where GST is added to the
 * business's prices, the amount to pay, as the page's button names it.
 *
 * Kept apart from the page so it can be tested without a request; the page
 * renders `productJsonLdScript` in a server-rendered
 * `<script type="application/ld+json">`.
 */

const SCHEMA = "https://schema.org";

/**
 * What schema.org calls each stock word. LOW is still for sale, in short
 * supply. UNTRACKED means nobody counts it, and the page sells it as
 * available, so it reads as in stock.
 */
const AVAILABILITY: Record<StockWord, string> = {
    IN_STOCK: `${SCHEMA}/InStock`,
    LOW: `${SCHEMA}/LimitedAvailability`,
    SOLD_OUT: `${SCHEMA}/OutOfStock`,
    UNTRACKED: `${SCHEMA}/InStock`,
};

/** The description as plain text: the API sends sanitised HTML. */
export function plainText(html: string): string {
    return html
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0*39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}

function absolute(url: string, origin: string): string {
    try {
        return new URL(url, origin).toString();
    } catch {
        return url;
    }
}

/**
 * The price an offer publishes: what the customer pays. Where the business
 * adds GST to its prices, that is the API's amount to pay (its `payCents`,
 * written as a decimal); otherwise the typed price, exactly as it came.
 * Nothing is added up here.
 */
function payPrice(typed: string, gst: unknown): string {
    const on = gstOnPriceOf(gst);
    return on?.mode === "ADDED" ? (on.payCents / 100).toFixed(2) : typed;
}

/**
 * The MRP as a list price, only where it is above the price the offer
 * publishes: the amount to pay, GST and all, since an MRP includes its
 * taxes. `saving` is the API's own answer to that (the one the page
 * strikes through); with none sent, the MRP is compared with the offer's
 * price here. An offer at its MRP, or above it, publishes no list price.
 */
function listPrice(
    price: string,
    mrp: string | null,
    currency: string,
    saving: unknown,
) {
    const shown = shownSaving(saving, price, mrp);
    if (!shown) return undefined;
    return {
        "@type": "UnitPriceSpecification",
        priceType: `${SCHEMA}/ListPrice`,
        price: shown.mrp,
        priceCurrency: currency,
    };
}

export interface ProductJsonLdInput {
    product: CatalogueProduct;
    /** The site's origin, `https://<host>`: the page's address hangs off it. */
    origin: string;
    /** The business's name, as the site shows it. The seller. */
    business: string;
}

export function productJsonLd({
    product,
    origin,
    business,
}: ProductJsonLdInput): Record<string, unknown> {
    const url = absolute(`/shop/${encodeURIComponent(product.slug)}`, origin);
    const seller = { "@type": "Organization", name: business };
    const offer = (
        typed: string,
        gst: unknown,
        mrp: string | null,
        saving: unknown,
        stock: StockWord | null,
        name?: string,
    ) => {
        const price = payPrice(typed, gst);
        const spec = listPrice(price, mrp, product.currency, saving);
        return {
            "@type": "Offer",
            ...(name ? { name } : {}),
            url,
            price,
            priceCurrency: product.currency,
            ...(stock ? { availability: AVAILABILITY[stock] } : {}),
            ...(spec ? { priceSpecification: spec } : {}),
            seller,
        };
    };

    const offers =
        product.variants.length > 0
            ? product.variants.map((v) =>
                  offer(
                      v.price ?? product.price,
                      // The option's own GST where the API sent one, else
                      // the product's while it sells at the product's price:
                      // the rule the page's price follows (`productGst`).
                      v.gst !== undefined
                          ? v.gst
                          : v.price === null
                            ? product.gst
                            : null,
                      // Its own MRP, else the product's: the page's rule.
                      v.mrp ?? product.mrp,
                      v.saving,
                      v.stock,
                      `${product.name} – ${v.title}`,
                  ),
              )
            : [
                  offer(
                      product.price,
                      product.gst,
                      product.mrp,
                      product.saving,
                      product.stock?.word ?? null,
                  ),
              ];

    const images = product.images
        .filter((i) => i.kind !== "video")
        .map((i) => absolute(i.url, origin));
    const description = product.seoDescription?.trim()
        ? product.seoDescription.trim()
        : product.description
          ? plainText(product.description)
          : "";

    return {
        "@context": SCHEMA,
        "@type": "Product",
        name: product.name,
        url,
        ...(images.length > 0 ? { image: images } : {}),
        ...(description ? { description } : {}),
        ...(product.categoryName ? { category: product.categoryName } : {}),
        offers: offers.length === 1 ? offers[0] : offers,
        // The API counts published reviews only, never a hidden one, and the
        // page draws the same figure.
        ...(product.rating && product.rating.count > 0
            ? {
                  aggregateRating: {
                      "@type": "AggregateRating",
                      ratingValue: product.rating.average,
                      reviewCount: product.rating.count,
                      bestRating: 5,
                      worstRating: 1,
                  },
              }
            : {}),
    };
}

/**
 * JSON for inside a `<script>`: `<` (so `</script>` can't close it), `>`,
 * `&` and the two JavaScript line separators are written as escapes, which
 * JSON reads back as the same characters.
 */
export function jsonLdScript(data: unknown): string {
    return JSON.stringify(data)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

export function productJsonLdScript(input: ProductJsonLdInput): string {
    return jsonLdScript(productJsonLd(input));
}
