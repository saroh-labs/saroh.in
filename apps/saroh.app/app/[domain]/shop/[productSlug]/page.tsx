import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductPage, ShopUnavailable } from "@saroh/site-blocks";

import { getCatalogueProduct } from "@/lib/catalogue";
import { getSiteForHost, postsPrefix, shareImages } from "@/lib/publication";

import PostPage, {
    generateMetadata as postMetadata,
} from "../../[slug]/[postSlug]/page";

/**
 * One product on a merchant's site (round-2 G11): `/shop/<product>`, drawn
 * by the same `ProductPage` the workspace's Customer view previews it with,
 * in public mode — no staff notes, and an action slot that the bag and
 * checkout (G13) fill with Add to bag or "Ask about ordering". Until then
 * the slot is empty and the page only shows the product.
 *
 * 404 unless the product is published, not archived and sold at the site's
 * storefront, and the shop is open (the API decides; see `lib/catalogue.ts`).
 * Nothing else lives under `/shop` — G13's server actions sit in
 * `shop/actions.ts`, not a segment — except the merchant's posts when they
 * call their writing "shop", which this route keeps serving as before.
 */

export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string; productSlug: string }>;
}): Promise<Metadata | null> {
    const { domain, productSlug } = await params;
    const resolved = await getSiteForHost(domain);
    if (!resolved?.siteId) return null;
    if (postsPrefix(resolved.snapshot) === "shop") {
        return postMetadata({
            params: Promise.resolve({
                domain,
                slug: "shop",
                postSlug: productSlug,
            }),
        });
    }
    const lookup = await getCatalogueProduct(resolved.siteId, productSlug);
    if (!lookup.ok) return null;
    const product = lookup.data;
    const name = resolved.snapshot.site.name;
    // An empty search title means "not written", never an empty <title>.
    const title = product.seoTitle?.trim()
        ? product.seoTitle
        : `${product.name} · ${name}`;
    const description = product.seoDescription?.trim()
        ? product.seoDescription
        : undefined;
    const cover = product.images.find((i) => i.kind !== "video");
    const images = cover ? [cover.url] : shareImages(resolved.snapshot.site);
    const url = `/shop/${product.slug}`;
    return {
        title,
        description,
        openGraph: { title, description, images, url, siteName: name },
        twitter: {
            card: images ? "summary_large_image" : "summary",
            title,
            description,
            images,
        },
        metadataBase: new URL(`https://${domain}`),
    };
}

export default async function ShopProductPage({
    params,
}: {
    params: Promise<{ domain: string; productSlug: string }>;
}) {
    const { domain, productSlug } = await params;
    const resolved = await getSiteForHost(domain);
    if (!resolved?.siteId) notFound();

    if (postsPrefix(resolved.snapshot) === "shop") {
        return (
            <PostPage
                params={Promise.resolve({
                    domain,
                    slug: "shop",
                    postSlug: productSlug,
                })}
            />
        );
    }

    const lookup = await getCatalogueProduct(resolved.siteId, productSlug);
    if (!lookup.ok) {
        if (lookup.reason === "missing") notFound();
        return <ShopUnavailable business={resolved.snapshot.site.name} />;
    }
    return <ProductPage product={lookup.data} preview={false} />;
}
