import type { SiteSummary } from "@/lib/sites/service";

/**
 * The address "Share your storefront" copies, on an Orders list with no
 * orders yet (B7's first run, built in B8): the business's first site that
 * is live and has an address. Null when none is — a draft site has no page
 * anyone could open, so there is nothing to share.
 */
export function storefrontShareUrl(
    sites: readonly Pick<SiteSummary, "subdomain" | "currentPublicationId">[],
    rootDomain: string,
): string | null {
    const live = sites.find((s) => s.currentPublicationId && s.subdomain);
    return live?.subdomain ? `https://${live.subdomain}.${rootDomain}` : null;
}
