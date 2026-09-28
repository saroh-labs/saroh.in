import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
    ModulePageUnavailable,
    ShopListing,
    ShopUnavailable,
} from "@saroh/site-blocks";

import { PublishedPage } from "@/components/published-page";
import { getCatalogue } from "@/lib/catalogue";
import { isFreePage, moduleLabel, moduleRoute } from "@/lib/module-pages";
import type { PublicationSnapshot } from "@/lib/publication";
import { findPageByPath, getSiteForHost, postsPrefix } from "@/lib/publication";

import SlugPage, { generateMetadata as slugMetadata } from "../[slug]/page";

/**
 * The shop on a merchant's site (round-2 G11): `/shop`, every product its
 * sells-from storefront sells, each opening `/shop/<product>`.
 *
 * A static segment, so it wins over `[slug]`. What it serves, in order:
 * 1. **What `[slug]` served here before**: the merchant's posts, when they
 *    call their writing "shop", or a free-form page of their own at
 *    `/shop`. This route hides nothing that was live; the editor flags the
 *    page with a new address to find.
 * 2. **The Shop page** (G15), when the site has published one: its
 *    sections, in place of the built-in grid. While Commerce is off (or the
 *    shop isn't rolled out) its address says "This isn't available right
 *    now" with a link home.
 * 3. **The shop**, when the API serves one. It 404s — as `/shop` did before
 *    — unless the shop is open for the business (the API's `SITE_SHOP`
 *    flag), Commerce is on, the site sells from a storefront and something
 *    is sold there.
 *
 * `/shop/<product>` is always the product page, Shop page or not.
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
    // The Shop page's own title (G15), which is also its menu name.
    const label = moduleLabel(snapshot.pages, "SHOP", "Shop");
    return {
        title: `${label} · ${name}`,
        openGraph: {
            title: `${label} · ${name}`,
            siteName: name,
            url: "/shop",
        },
        metadataBase: new URL(`https://${domain}`),
    };
}

/** A free-form page of the merchant's own, or their writing, lives here. */
function servedBySlug(snapshot: PublicationSnapshot): boolean {
    const page = findPageByPath(snapshot, "/shop");
    return (
        postsPrefix(snapshot) === "shop" || (page !== null && isFreePage(page))
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

    const route = moduleRoute(snapshot.pages, resolved.modules, "SHOP");
    if (route.draw === "unavailable") {
        return <ModulePageUnavailable business={snapshot.site.name} />;
    }
    if (route.draw === "page") {
        return (
            <PublishedPage
                page={route.page}
                snapshot={snapshot}
                siteId={siteId}
            />
        );
    }

    if (!siteId) notFound();
    const lookup = await getCatalogue(siteId);
    if (!lookup.ok) {
        if (lookup.reason === "missing") notFound();
        return <ShopUnavailable business={snapshot.site.name} />;
    }
    return <ShopListing products={lookup.data.products} />;
}
