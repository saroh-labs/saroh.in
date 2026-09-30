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

/** Where "Your online shop →" goes: `/shop` when live, else the Sells from row. */
export interface OnlineShopLink {
    href: string;
    /** `/shop` on the website, opened in a new tab. */
    live: boolean;
}

/**
 * Whether a location sells in person only, in person and online, or online
 * only (DEC-069, KTD-12). Derived, never stored: online means this location
 * is the site's effective Sells from; in person means customers visit it
 * (the `SHOP` kind).
 */
export type LocationSelling =
    | { says: "in-person" }
    | { says: "in-person-and-online" | "online-only"; shop: OnlineShopLink }
    | { says: "not-yet"; shop: OnlineShopLink | null };

export function locationSelling(
    location: { id: string; kind: "SHOP" | "ONLINE" },
    site: SiteSelling | null,
): LocationSelling {
    const sellsFrom = site?.sellsFrom ?? null;
    const sells = sellsFrom?.storefront?.id === location.id;
    // `/shop` serves once the site is live, sells from here and has
    // something listed (the API's rule for the shop page).
    const listed =
        (sellsFrom?.choices.find((c) => c.id === location.id)?.products ?? 0) >
        0;
    const shop: OnlineShopLink | null =
        site && sellsFrom
            ? sells && listed && site.origin
                ? { href: `${site.origin}/shop`, live: true }
                : {
                      href: `/sites/${encodeURIComponent(site.siteId)}/settings#${SELLS_FROM_ANCHOR}`,
                      live: false,
                  }
            : null;

    if (sells && shop) {
        return location.kind === "ONLINE"
            ? { says: "online-only", shop }
            : { says: "in-person-and-online", shop };
    }
    return location.kind === "SHOP"
        ? { says: "in-person" }
        : { says: "not-yet", shop };
}

/** The words for {@link locationSelling}; its link reads "Your online shop". */
export function locationSellingLine(selling: LocationSelling): string {
    switch (selling.says) {
        case "in-person":
            return "Sells in person only";
        case "in-person-and-online":
            return "Sells in person and online";
        case "online-only":
            return "Online only";
        case "not-yet":
            return "Not selling yet: no counter, and your online shop doesn't sell from here";
    }
}
