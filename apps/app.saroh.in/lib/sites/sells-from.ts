import type { SellsFrom } from "./service";

/**
 * What the site settings' Sells from row says when it isn't asking (G11).
 * Said, not implied: a site with no storefront chosen shows nothing in its
 * shop, and the row says why.
 */
export function sellsFromLine(sellsFrom: SellsFrom): string {
    if (sellsFrom.storefront) {
        return `Your site sells from ${sellsFrom.storefront.name}`;
    }
    if (sellsFrom.choices.length === 0) {
        return "None of your storefronts sells a product yet. Products live in Sell › Products.";
    }
    return "Not chosen yet. Until it is, the shop shows nothing on your site.";
}
