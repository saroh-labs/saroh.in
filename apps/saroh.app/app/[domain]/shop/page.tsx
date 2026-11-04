import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
    lookOf,
    LookShopListing,
    modulePageTopOf,
    ModulePageUnavailable,
    NotTakingOrders,
    reachOf,
    shopFactsLine,
    shopLeadLine,
    ShopListing,
    ShopUnavailable,
} from "@saroh/site-blocks";

import { PublishedPage } from "@/components/published-page";
import { publicApiUrl } from "@/lib/api-url";
import { getCatalogue } from "@/lib/catalogue";
import {
    findModulePage,
    isFreePage,
    moduleLabel,
    moduleRoute,
    NOT_FOR_SEARCH,
    routeHasNothing,
} from "@/lib/module-pages";
import { dontCachePage, listsProducts } from "@/lib/page-cache/site-rules";
import type { PublicationSnapshot } from "@/lib/publication";
import { findPageByPath, getSiteForHost, postsPrefix } from "@/lib/publication";
import { getCheckoutOptions } from "@/lib/shop-checkout";
import { enquiryPagePath } from "@/lib/shop-checkout-shape";
import { shopCutOff } from "@/lib/shop-cut-off";
import {
    ALL_PRODUCTS_HREF,
    shopPageFeeds,
    withShopGrid,
} from "@/lib/shop-page-offer";
import { getSiteContact } from "@/lib/site-contact";
import { canonical, shopDescription } from "@/lib/site-meta";
import { getProductGridFeeds } from "@/lib/site-product-grids";
import { shareable } from "@/lib/test-metadata";

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
 *    now" with a link home. Everything sold stays within reach of it
 *    (`lib/shop-page-offer.ts`): "See all products" opens `?all=1`, the
 *    built-in listing, and grids that draw nothing give way to it.
 * 3. **The shop**, when the API serves one. It 404s — as `/shop` did before
 *    — unless the shop is open for the business (the API's `SITE_SHOP`
 *    flag), Commerce is on, the site sells from a storefront and something
 *    is sold there.
 *
 * `/shop/<product>` is always the product page, Shop page or not.
 *
 * The built-in shop says how an order reaches the customer in one line
 * under its heading, from the location's checkout (`shopLeadLine`), and
 * nothing when the site takes no online orders. A page that has nothing to
 * show (the module is off, nothing is on sale) is kept out of search: it
 * answers 200, and "not available" is not a page to rank. A read that failed
 * says nothing about that, so a blip keeps the page indexed.
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
    // A shop that 404s (below) says so in the tab, not "Shop". The page
    // asks the same cached lookup, so this costs no second request.
    if (await shopIsMissing(resolved)) {
        return { title: `Page not found · ${name}` };
    }
    // The Shop page's own title (G15), which is also its menu name.
    const label = moduleLabel(snapshot.pages, "SHOP", "Shop");
    // What the shop is, for search: the Shop page's own lead, else what
    // is sold there (the page's own cached read). Nothing when neither.
    const catalogue = resolved.siteId
        ? await getCatalogue(resolved.siteId)
        : null;
    const description = shopDescription({
        lead: modulePageTopOf(findModulePage(snapshot.pages, "SHOP") ?? {})
            ?.lead,
        business: name,
        products: catalogue?.ok
            ? catalogue.data.products.map((p) => p.name)
            : [],
    });
    return shareable(resolved, {
        ...(shopHasNothing(resolved, catalogue) ? NOT_FOR_SEARCH : {}),
        title: `${label} · ${name}`,
        description,
        openGraph: {
            title: `${label} · ${name}`,
            description,
            siteName: name,
            url: "/shop",
        },
        ...canonical(resolved, domain, "/shop"),
    });
}

/** Whether the built-in shop has nothing to serve, so the page 404s. */
async function shopIsMissing(
    resolved: NonNullable<Awaited<ReturnType<typeof getSiteForHost>>>,
): Promise<boolean> {
    const route = moduleRoute(
        resolved.snapshot.pages,
        resolved.modules,
        "SHOP",
    );
    if (route.draw !== "builtin") return false;
    if (!resolved.siteId) return true;
    const lookup = await getCatalogue(resolved.siteId);
    return !lookup.ok && lookup.reason === "missing";
}

/**
 * Whether `/shop` draws no shop now: its page is taken off while Commerce
 * is off, or the shop's read came back with nothing on sale. A read that
 * failed doesn't say so.
 */
function shopHasNothing(
    resolved: NonNullable<Awaited<ReturnType<typeof getSiteForHost>>>,
    catalogue: Awaited<ReturnType<typeof getCatalogue>> | null,
): boolean {
    return routeHasNothing(
        moduleRoute(resolved.snapshot.pages, resolved.modules, "SHOP"),
        catalogue?.ok
            ? catalogue.data.products.length === 0
            : catalogue?.reason !== "unavailable",
    );
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
    searchParams,
}: {
    params: Promise<{ domain: string }>;
    searchParams: Promise<{ all?: string | string[] }>;
}) {
    const { domain } = await params;
    const { all } = await searchParams;
    const resolved = await getSiteForHost(domain);
    if (!resolved) notFound();
    const { snapshot, siteId } = resolved;

    if (servedBySlug(snapshot)) {
        return <SlugPage params={Promise.resolve({ domain, slug: "shop" })} />;
    }

    const route = moduleRoute(
        snapshot.pages,
        resolved.modules,
        "SHOP",
        all !== undefined,
    );
    if (route.draw === "unavailable") {
        return (
            <ModulePageUnavailable
                business={snapshot.site.name}
                look={lookOf(snapshot.site.look)}
            />
        );
    }
    if (!siteId) {
        if (route.draw !== "page") notFound();
        return (
            <main className="w-full">
                <PublishedPage
                    page={route.page}
                    snapshot={snapshot}
                    siteId={siteId}
                />
            </main>
        );
    }
    const page = route.draw === "page" ? withShopGrid(route.page) : null;
    const [lookup, checkout, feeds] = await Promise.all([
        getCatalogue(siteId),
        getCheckoutOptions(siteId),
        page ? getProductGridFeeds(page.sections, siteId, true) : undefined,
    ]);
    const failed = !lookup.ok && lookup.reason !== "missing";
    if (page && !failed) {
        const grids = shopPageFeeds(
            page.sections,
            feeds,
            lookup.ok ? lookup.data.products : [],
        );
        // The page's main landmark (UX-082), as the product page has: the
        // header and footer sit outside it.
        if (grids) {
            return (
                <main className="w-full">
                    <PublishedPage
                        page={page}
                        snapshot={snapshot}
                        siteId={siteId}
                        productGrids={grids}
                    />
                </main>
            );
        }
    }
    // A Shop page with nothing on sale says so below; with no page, a 404.
    if (!lookup.ok && !failed && route.draw !== "page") notFound();
    if (failed) {
        dontCachePage("shop unavailable");
        return (
            <ShopUnavailable
                business={snapshot.site.name}
                // The address as it was opened, past a Shop page too.
                retryHref={all !== undefined ? ALL_PRODUCTS_HREF : "/shop"}
                look={lookOf(snapshot.site.look)}
                // The layout's own read, shared through `cache`.
                reach={reachOf(await getSiteContact(siteId))}
            />
        );
    }
    const products = lookup.ok ? lookup.data.products : [];
    // Every listed product's price and stock is on this page (#863).
    listsProducts(siteId);
    // Each card's Add to bag (the design's shop), only where the site takes
    // online orders now; otherwise the cards open the product, whose page
    // offers "Ask about ordering".
    const reach =
        products.length === 0 ? reachOf(await getSiteContact(siteId)) : null;
    // Folio, Quiet or Live (DEC-172, U11): the look's shop, with the
    // owner's own cut-off line and what an order costs to receive, said
    // once. Absent: Classic's shop, exactly as before.
    const look = lookOf(snapshot.site.look);
    if (look) {
        return (
            <main className="w-full">
                {checkout?.notTakingOrders ? (
                    <NotTakingOrders banner demo={checkout.demo === true} />
                ) : null}
                <LookShopListing
                    look={look}
                    title={moduleLabel(snapshot.pages, "SHOP", "Shop")}
                    products={products}
                    bagSite={checkout?.canOrder ? siteId : null}
                    lead={shopLeadLine(checkout)}
                    facts={checkout?.canOrder ? shopFactsLine(checkout) : null}
                    cutOff={checkout?.canOrder ? shopCutOff(snapshot) : null}
                    askHref={enquiryPagePath(snapshot)}
                    apiUrl={publicApiUrl()}
                    business={snapshot.site.name}
                    reach={reach}
                />
            </main>
        );
    }
    return (
        <main className="w-full">
            {checkout?.notTakingOrders ? (
                <NotTakingOrders banner demo={checkout.demo === true} />
            ) : null}
            <ShopListing
                products={products}
                bagSite={checkout?.canOrder ? siteId : null}
                // How an order reaches the customer, only from what this
                // location's checkout offers now; nothing otherwise.
                lead={shopLeadLine(checkout)}
                business={snapshot.site.name}
                // The ways to reach the business, where nothing is on sale.
                reach={reach}
            />
        </main>
    );
}
