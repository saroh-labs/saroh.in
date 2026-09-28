import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ShopListing, ShopUnavailable } from "@saroh/site-blocks";

import { getCatalogue } from "@/lib/catalogue";
import type { PublicationSnapshot } from "@/lib/publication";
import { findPageByPath, getSiteForHost, postsPrefix } from "@/lib/publication";

import SlugPage, { generateMetadata as slugMetadata } from "../[slug]/page";

/**
 * The shop on a merchant's site (round-2 G11): `/shop`, every product its
 * sells-from storefront sells, each opening `/shop/<product>`.
 *
 * A static segment, so it wins over `[slug]`. What it serves, in order:
 * 1. **What `[slug]` served here before**: the merchant's posts, when they
 *    call their writing "shop", or a page of their own at `/shop`. This
 *    route hides nothing that was live; the editor flags the page with a
 *    new address to find.
 * 2. **The shop**, when the API serves one. It 404s — as `/shop` did before
 *    — unless the shop is open for the business (the API's `SITE_SHOP` flag,
 *    off until the bag and checkout, G13, ship), Commerce is on, the site
 *    sells from a storefront and something is sold there. Nothing links
 *    here yet: the header's Order button waits for G13, and the Shop page
 *    in the menu for G14.
 */

export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string }>;
}): Promise<Metadata | null> {
    const { domain } = await params;
    const resolved = await getSiteForHost(domain);
    if (!resolved) return null;
    const { snapshot } = resolved;
    if (servedBySlug(snapshot)) {
        return slugMetadata({
            params: Promise.resolve({ domain, slug: "shop" }),
        });
    }
    const name = snapshot.site.name;
    return {
        title: `Shop · ${name}`,
        openGraph: { title: `Shop · ${name}`, siteName: name, url: "/shop" },
        metadataBase: new URL(`https://${domain}`),
    };
}

/** A page of the merchant's own, or their writing, already lives here. */
function servedBySlug(snapshot: PublicationSnapshot): boolean {
    return (
        postsPrefix(snapshot) === "shop" ||
        findPageByPath(snapshot, "/shop") !== null
    );
}

export default async function ShopPage({
    params,
}: {
    params: Promise<{ domain: string }>;
}) {
    const { domain } = await params;
    const resolved = await getSiteForHost(domain);
    if (!resolved) notFound();
    const { snapshot, siteId } = resolved;

    if (servedBySlug(snapshot)) {
        return <SlugPage params={Promise.resolve({ domain, slug: "shop" })} />;
    }
    if (!siteId) notFound();

    const lookup = await getCatalogue(siteId);
    if (!lookup.ok) {
        if (lookup.reason === "missing") notFound();
        return <ShopUnavailable business={snapshot.site.name} />;
    }
    return <ShopListing products={lookup.data.products} />;
}
