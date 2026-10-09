import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { SignInOptions } from "@saroh/site-blocks";
import {
    AddToBag,
    AskAboutOrdering,
    NotTakingOrders,
    ProductPage,
    ShopUnavailable,
} from "@saroh/site-blocks";

import { getCatalogueProduct } from "@/lib/catalogue";
import { dontCachePage, showsProduct } from "@/lib/page-cache/site-rules";
import { getSiteForHost, postsPrefix, shareImages } from "@/lib/publication";
import { getCheckoutOptions } from "@/lib/shop-checkout";
import { enquiryPagePath } from "@/lib/shop-checkout-shape";
import { getSignInOptions } from "@/lib/sign-in";
import { shareable } from "@/lib/test-metadata";

import PostPage, {
    generateMetadata as postMetadata,
} from "../../[slug]/[postSlug]/page";

/**
 * One product on a merchant's site (round-2 G11): `/shop/<product>`, drawn
 * by the same `ProductPage` the workspace's Customer view previews it with,
 * in public mode — no staff notes, and an action slot (G13): Add to bag
 * where the site takes an online order now, else "Ask about ordering",
 * which opens the site's enquiry form with the product named (or a call,
 * where the site has no form).
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
    return shareable(resolved, {
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
    });
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

    const [lookup, checkout] = await Promise.all([
        getCatalogueProduct(resolved.siteId, productSlug),
        getCheckoutOptions(resolved.siteId),
    ]);
    if (!lookup.ok) {
        if (lookup.reason === "missing") notFound();
        dontCachePage("shop unavailable");
        return <ShopUnavailable business={resolved.snapshot.site.name} />;
    }
    const product = lookup.data;
    // Its price and stock are on this page (#863).
    showsProduct(resolved.siteId, product.productId);
    const business = resolved.snapshot.site.name;
    const action =
        checkout?.canOrder && product.listingId ? (
            <AddToBag site={resolved.siteId} listingId={product.listingId} />
        ) : checkout?.notTakingOrders ? (
            // Stopped taking orders for now (#800): nothing to ask about.
            <NotTakingOrders />
        ) : (
            <AskAboutOrdering
                enquiryHref={enquiryPagePath(resolved.snapshot)}
                phone={
                    (
                        await getSignInOptions().catch(
                            (): SignInOptions | null => null,
                        )
                    )?.phone ?? null
                }
                businessName={business}
            />
        );
    // The page's own width, as the header's and every block's: at a desk
    // the product sits under the menu rather than across the whole screen.
    // The page's main landmark (UX-082): the header and footer sit outside.
    return (
        <main className="mx-auto w-full max-w-screen-xl">
            <ProductPage product={product} preview={false} action={action} />
        </main>
    );
}
