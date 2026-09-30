/**
 * The links Saroh hands a merchant to share, and the addresses the Website
 * screens show (DEC-069, plan L8). Pure: the read is `share-links-read.ts`.
 *
 * Everything comes from the API's web-address read (`GET organizations/:id/
 * web-address`, KTD-8): its `origin` is the verified custom domain when there
 * is one, else `<address>.saroh.app`, and each of its `links` is set only
 * while that page is live. Nothing here, and nothing in a component, puts
 * `<subdomain>.saroh.app` together itself — the one fallback, for a person
 * the API doesn't show the read to, is {@link siteAddressOf}'s.
 */

/** The parts of the API's web-address read these helpers use. */
export interface WebAddressLinks {
    /** The business's address: its website's subdomain, else its setup one. */
    address: string;
    /** Where customers go: the verified custom domain, else the address. */
    origin: string;
    /** `https://<address>.saroh.app`, which still works beside a domain. */
    platformOrigin: string;
    /** The verified custom domain's hostname, or null. */
    customDomain: string | null;
    /** Each link only while that page is live. */
    links: {
        site: string | null;
        shop: string | null;
        book: string | null;
    };
}

export type ShareKind = "shop" | "site" | "book";

/** One share button: what it copies, what it says, and what it says after. */
export interface ShareLink {
    kind: ShareKind;
    url: string;
    label: string;
    /** The toast once the link is on the clipboard. */
    copied: string;
}

const WORDS: Record<ShareKind, { label: string; copied: string }> = {
    shop: {
        label: "Share your online shop",
        copied: "Online shop link copied",
    },
    site: { label: "Share your website", copied: "Website link copied" },
    book: {
        label: "Share your booking page",
        copied: "Booking page link copied",
    },
};

/**
 * The first of `prefer` that is live, as a share button. Null when none is
 * (or the read isn't known): a page nobody can open is never offered.
 */
export function shareLink(
    read: Pick<WebAddressLinks, "links"> | null,
    prefer: readonly ShareKind[],
): ShareLink | null {
    if (!read) return null;
    for (const kind of prefer) {
        const url = read.links[kind];
        if (url) return { kind, url, ...WORDS[kind] };
    }
    return null;
}

/** An Orders list with no orders yet: the shop, else the website. */
export const ORDERS_FIRST_RUN: readonly ShareKind[] = ["shop", "site"];

/** Bookings with none made yet: the booking page. */
export const BOOKINGS_FIRST_RUN: readonly ShareKind[] = ["book"];

/** Where a site is reached, as the Website screens show it. */
export interface SiteAddress {
    /** "shop.rye.in" or "rye.saroh.app": what the merchant reads. */
    host: string;
    /** `https://` + host, for Open and View. */
    url: string;
    /** "rye.saroh.app": the Saroh address, which a domain never replaces. */
    platformHost: string;
}

/**
 * Where `site` is reached. The business's website (its subdomain is the
 * read's address) is at the read's origin, so a verified custom domain
 * shows; another site of the business is at its own subdomain on the same
 * apex. Null for a site with no address yet.
 *
 * Without the read — a role the API doesn't show it to, or a failure — the
 * subdomain is put on `fallbackApex` (the renderer's apex from the app's
 * environment), the one place the app still builds an address.
 */
export function siteAddressOf(
    site: { subdomain?: string | null },
    read: Pick<WebAddressLinks, "address" | "origin" | "platformOrigin"> | null,
    fallbackApex: string,
): SiteAddress | null {
    if (!site.subdomain) return null;
    const apex = read
        ? (apexOf(read.platformOrigin, read.address) ?? fallbackApex)
        : fallbackApex;
    const platformHost = `${site.subdomain}.${apex}`;
    const host =
        read?.address === site.subdomain ? hostOf(read.origin) : platformHost;
    return { host, url: `https://${host}`, platformHost };
}

/** `https://rye.saroh.app` → `rye.saroh.app`. */
function hostOf(origin: string): string {
    try {
        return new URL(origin).host;
    } catch {
        return origin.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    }
}

/** `https://rye.saroh.app` with address `rye` → `saroh.app`. */
function apexOf(platformOrigin: string, address: string): string | null {
    const host = hostOf(platformOrigin);
    const prefix = `${address}.`;
    return host.startsWith(prefix) ? host.slice(prefix.length) : null;
}
