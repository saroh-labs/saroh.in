import type { SellsFrom } from "./service";

/**
 * Said on the site's Shop settings while the shop could serve but Sells
 * from is unanswered (P4), in the same words as the Website readiness step
 * the API sends (`WEBSITE_SHOP_NOT_CHOSEN`).
 */
export const SHOP_AWAITS_SELLS_FROM =
    "Choose which storefront your site sells from — until then your shop page isn't live.";

/** The anchor the readiness step links to: the Shop section. */
export const SELLS_FROM_ANCHOR = "sells-from";

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
