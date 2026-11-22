import type { SiteAddress, WebAddressLinks } from "@/lib/sites/share-links";
import { siteAddressOf } from "@/lib/sites/share-links";

type Read = Pick<WebAddressLinks, "address" | "origin" | "platformOrigin">;

/**
 * DEC-230: one web address per business for now, the business's default.
 * The site that holds it is the one the Website area shows (All sites and
 * the switcher list one site until adding sites ships): the site at the
 * default address, else the first. Null with no sites.
 */
export function defaultSite<S extends { subdomain?: string | null }>(
    sites: readonly S[],
    read: Read | null,
): S | null {
    return (
        sites.find((s) => read && s.subdomain === read.address) ??
        sites.at(0) ??
        null
    );
}

/**
 * The business's one web address (DEC-230), which the site header,
 * Overview and Links show. Without the read (a role it isn't shown to, or a
 * failure) it is `site`'s own, on the renderer's apex.
 */
export function businessAddress(
    site: { subdomain?: string | null },
    read: Read | null,
    fallbackApex: string,
): SiteAddress | null {
    return siteAddressOf(
        read ? { subdomain: read.address } : site,
        read,
        fallbackApex,
    );
}
