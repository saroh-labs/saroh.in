import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { SignInOptions } from "@saroh/site-blocks";
import {
    AddToBag,
    AskAboutOrdering,
    BackInStock,
    LookAddToBag,
    lookOf,
    NotTakingOrders,
    ProductPage,
    reachOf,
    shopFactsLine,
    ShopUnavailable,
} from "@saroh/site-blocks";

import { VisitStep } from "@/components/visit-step";
import { getCatalogueProduct } from "@/lib/catalogue";
import { moduleLabel, NOT_FOR_SEARCH } from "@/lib/module-pages";
import { dontCachePage, showsProduct } from "@/lib/page-cache/site-rules";
import { productJsonLdScript } from "@/lib/product-json-ld";
import {
    getSiteForHost,
    postsPrefix,
    shareImages,
    siteOriginFor,
} from "@/lib/publication";
import { getCheckoutOptions } from "@/lib/shop-checkout";
import { enquiryPagePath } from "@/lib/shop-checkout-shape";
import { shopCutOff } from "@/lib/shop-cut-off";
import { getSignInOptions } from "@/lib/sign-in";
import { getSiteContact } from "@/lib/site-contact";
import { canonical, productDescription } from "@/lib/site-meta";
import { shareable } from "@/lib/test-metadata";

import PostPage, {
    generateMetadata as postMetadata,
} from "../../[slug]/[postSlug]/page";
import { backInStockOffer, stopWaiting, watchBackInStock } from "../actions";

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
    if (!lookup.ok) {
        // "We couldn't open the shop" answers 200: kept out of search,
        // with nothing else said about the page. A missing product 404s.
        return lookup.reason === "unavailable" ? NOT_FOR_SEARCH : null;
    }
    const product = lookup.data;
    const name = resolved.snapshot.site.name;
    // An empty search title means "not written", never an empty <title>.
    const title = product.seoTitle?.trim()
        ? product.seoTitle
        : `${product.name} · ${name}`;
    // The one its merchant wrote, else its blurb: the start of what the
    // page says about it.
    const description = productDescription(product);
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
        ...canonical(resolved, domain, url),
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
        return (
            <ShopUnavailable
                business={resolved.snapshot.site.name}
                retryHref={`/shop/${encodeURIComponent(productSlug)}`}
                look={lookOf(resolved.snapshot.site.look)}
                // The layout's own read, shared through `cache`.
                reach={reachOf(await getSiteContact(resolved.siteId))}
            />
        );
    }
    const product = lookup.data;
    // Its price and stock are on this page (#863).
    showsProduct(resolved.siteId, product.productId);
    const business = resolved.snapshot.site.name;
    // Folio, Quiet or Live (DEC-172, U11): the look's Add to bag and its
    // − 1 + stepper; absent, Classic's.
    const look = lookOf(resolved.snapshot.site.look);
    // "Tell me when it's back" (DEC-174, U24, #1155): drawn only for a
    // sold-out option the API says it may be offered for, asked in the
    // browser, so the cached page holds nothing of it.
    const tellMe = product.productId ? (
        <BackInStock
            api={{
                offer: backInStockOffer,
                watch: watchBackInStock,
                stop: stopWaiting,
            }}
            productId={product.productId}
            business={business}
            look={look}
        />
    ) : null;
    const action =
        checkout?.canOrder && product.listingId ? (
            look ? (
                <>
                    {/* The form leads; "Ask about it" and the way back
                        follow it. */}
                    {tellMe}
                    <LookAddToBag
                        look={look}
                        site={resolved.siteId}
                        listingId={product.listingId}
                        askHref={enquiryPagePath(resolved.snapshot)}
                    />
                </>
            ) : (
                <>
                    {/* "Sold out" on the button, then the form under it. */}
                    <AddToBag
                        site={resolved.siteId}
                        listingId={product.listingId}
                    />
                    {tellMe}
                </>
            )
        ) : checkout?.notTakingOrders ? (
            // Stopped taking orders for now (#800): nothing to ask about.
            <NotTakingOrders />
        ) : (
            <>
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
                {/* Sold out where orders are taken by asking: still worth
                    an email when it's back. */}
                {tellMe}
            </>
        );
    // The page's own width, as the header's and every block's: at a desk
    // the product sits under the menu rather than across the whole screen.
    // The page's main landmark (UX-082): the header and footer sit outside.
    return (
        <main className="mx-auto w-full max-w-site-content">
            {/* The visit looked at a product (U15): once a visit, its source only. */}
            <VisitStep step="looked" />
            {/* Product structured data (#473), from what this page shows. */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: productJsonLdScript({
                        product,
                        origin: siteOriginFor(resolved, domain),
                        business,
                    }),
                }}
            />
            <ProductPage
                product={product}
                preview={false}
                action={action}
                // The way back to the shop, by the Shop page's own name
                // (its menu name): a product page linked to nothing but
                // the header before.
                back={{
                    href: "/shop",
                    label: moduleLabel(resolved.snapshot.pages, "SHOP", "Shop"),
                }}
                // What it costs to receive, before the bag: only what this
                // location's checkout offers now.
                facts={
                    checkout?.canOrder && product.listingId
                        ? look
                            ? // The owner's cut-off line leads, said once.
                              [
                                  shopCutOff(resolved.snapshot),
                                  shopFactsLine(checkout),
                              ]
                                  .filter(Boolean)
                                  .join(". ") || null
                            : shopFactsLine(checkout)
                        : null
                }
                look={look}
            />
        </main>
    );
}
