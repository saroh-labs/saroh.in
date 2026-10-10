import type { Metadata } from "next";

import {
    plainSiteIconDataUrl,
    plainSiteIconSvg,
} from "@saroh/site-blocks/site-icon";

/**
 * A merchant site's icon (DEC-124): the tab, a bookmark, a phone's home
 * screen.
 *
 * The public site read resolves which one (the site's own, published; else
 * the business logo; else none) and sends it with the snapshot, so no page
 * asks again. With none, the site draws a plain tile with its initial in
 * its own colours (`@saroh/site-blocks/site-icon`). Never Saroh's mark, and
 * never another company's: this app ships no icon file of its own.
 *
 * Pure but for the two `Response` builders, so the tests reach every case
 * without a server.
 */

/** What an uploaded icon may be (the API's rule; no SVG). */
const ICON_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** The icon a site shows, as the public read sends it. */
export interface SiteIcon {
    url: string;
    /** Its media type, declared on the link; null when unknown. */
    type: string | null;
    /** `site`: its own. `business`: the business logo standing in. */
    source: "site" | "business";
}

/**
 * The icon from a public read, or null. A wire boundary: an API that
 * predates icons sends none, and nothing but a web address is ever put in
 * a page's head or a redirect.
 */
export function siteIconOf(value: unknown): SiteIcon | null {
    if (value === null || typeof value !== "object") return null;
    const { url, type, source } = value as Record<string, unknown>;
    if (typeof url !== "string") return null;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return null;
    }
    return {
        url: parsed.toString(),
        type:
            typeof type === "string" && ICON_TYPES.includes(type) ? type : null,
        source: source === "business" ? "business" : "site",
    };
}

/** Where a site with no icon serves its plain tile, on its own host. */
export const PLAIN_ICON_PATH = "/site-icon.svg";

const SVG_TYPE = "image/svg+xml";

/**
 * A page's `icons` metadata.
 *
 * An uploaded image is declared as it is, with its type: there is no image
 * resizing for merchant media, and a browser scales one square to the tab.
 * The same file is the phone's home-screen icon. The plain tile is an SVG
 * on the site's own host; it names no touch icon, since a phone wants a
 * bitmap and draws its own tile from the page without one.
 */
export function siteIconMetadata(
    icon: SiteIcon | null,
): NonNullable<Metadata["icons"]> {
    if (!icon) {
        return {
            icon: [{ url: PLAIN_ICON_PATH, type: SVG_TYPE, sizes: "any" }],
        };
    }
    const declared = {
        url: icon.url,
        ...(icon.type ? { type: icon.type } : {}),
    };
    return { icon: [declared], apple: [declared] };
}

/**
 * The same for a draft preview, which lives on the renderer's own address
 * and has no host route to serve a tile from: the tile rides in the link.
 */
export function previewIconMetadata(
    icon: SiteIcon | null,
    site: PlainIconSite,
): NonNullable<Metadata["icons"]> {
    if (icon) return siteIconMetadata(icon);
    return { icon: [{ url: plainSiteIconDataUrl(site), type: SVG_TYPE }] };
}

/** What the plain tile is drawn from: the snapshot's name and look. */
export interface PlainIconSite {
    name: string | null | undefined;
    variables?: Readonly<Record<string, string>> | null;
}

/**
 * How long a browser may keep an icon answer: the page cache's own five
 * minutes (#863), so a new icon is in the tab about when it is on the page.
 */
const ICON_CACHE = "public, max-age=300";

/** The plain tile, as a file. */
export function plainIconResponse(site: PlainIconSite): Response {
    return new Response(plainSiteIconSvg(site), {
        headers: {
            "content-type": `${SVG_TYPE}; charset=utf-8`,
            "cache-control": ICON_CACHE,
        },
    });
}

/**
 * What `/favicon.ico` answers on a merchant's host. Browsers ask for that
 * path on their own, whatever the page declared (a PDF, a feed, an old
 * browser). An uploaded icon or the logo is on the media address, so the
 * answer forwards there; the file is never read through this app. With
 * neither, the plain tile is the answer itself.
 *
 * 302, not 301: the icon can change at the next publish.
 */
export function faviconResponse(
    icon: SiteIcon | null,
    site: PlainIconSite,
): Response {
    if (!icon) return plainIconResponse(site);
    return new Response(null, {
        status: 302,
        headers: { location: icon.url, "cache-control": ICON_CACHE },
    });
}

/** No live site on this host: no icon either. */
export function noIconResponse(): Response {
    return new Response("Not found", {
        status: 404,
        headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
        },
    });
}
