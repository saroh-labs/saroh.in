import type { SellsFrom } from "./service";

/**
 * Said on the site's Shop settings while the shop could serve but Sells
 * from is unanswered (P4), in the same words as the Website readiness step
 * the API sends (`WEBSITE_SHOP_NOT_CHOSEN`).
 */
export const SHOP_AWAITS_SELLS_FROM =
    "Choose which location your online shop sells from — until then your shop page isn't live.";

/** The anchor the readiness step links to: the Shop section. */
export const SELLS_FROM_ANCHOR = "sells-from";

/**
 * What the site settings' Sells from row says when it isn't asking (G11),
 * in DEC-069's words: "Your online shop sells from ‹Location›". Said, not
 * implied: a site with no location chosen shows nothing in its shop, and the
 * row says why.
 */
export function sellsFromLine(sellsFrom: SellsFrom): string {
    if (sellsFrom.storefront) {
        return `Your online shop sells from ${sellsFrom.storefront.name}`;
    }
    if (sellsFrom.choices.length === 0) {
        return "None of your locations sells a product yet. Products live in Sell › Products.";
    }
    return "Not chosen yet. Until it is, your online shop shows nothing on your site.";
}

/**
 * What the Locations screen knows about the business's website (DEC-069,
 * L9): which location its online shop sells from, and where the public
 * reaches it. `null` stands for a business with no website.
 */
export interface SiteSelling {
    siteId: string;
    /** Null while the shop isn't open for the business (the API's `SITE_SHOP`). */
    sellsFrom: SellsFrom | null;
    /** "https://rye.saroh.app" once the site is published with an address. */
    origin: string | null;
}
