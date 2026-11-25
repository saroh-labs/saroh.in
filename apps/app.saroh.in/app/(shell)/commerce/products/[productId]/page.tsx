import { notFound } from "next/navigation";

import { ProductPageFrame } from "@/components/commerce/product-page/page-state";
import { ProductContainer } from "@/components/commerce/product-page/product-container";
import { AccessDenied } from "@/components/shared/states/access-denied";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { activeCut, pausedByCut } from "@/lib/billing/paused";
import { listCollections } from "@/lib/collections/service";
import { knownRoleName } from "@/lib/organizations/role-name";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { recordTitle } from "@/lib/page-title";
import { readPriceHistory } from "@/lib/price-history/service";
import { readOverview } from "@/lib/products/access";
import { productTabOf } from "@/lib/products/links";
import { shopProductUrl } from "@/lib/products/overview-words";
import { productAsk } from "@/lib/products/queries";
import { listCategories } from "@/lib/products/service";
import { listAllergens } from "@/lib/products/settings";
import { countsStock } from "@/lib/products/tracking";
import { pausedOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { readShareSetup } from "@/lib/share-item/read";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";
import { getWaitingCount, stockTrackingOnce } from "@/lib/stock/service";

import Loading from "./loading";

/** The product's own name in the tab; "Product" when it can't be read. */
export async function generateMetadata({
    params,
    searchParams,
}: {
    params: Promise<{ productId: string }>;
    searchParams: Promise<{ storefront?: string }>;
}) {
    const [{ productId }, { storefront }] = await Promise.all([
        params,
        searchParams,
    ]);
    return recordTitle(
        () => readOverview(storefront, productId),
        (overview) => overview.product.name,
        "Product",
    );
}

const ROLE_WORD = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
} as const;

/**
 * Sell → Products → one product, after "Saroh Product Detail" (#522, #523).
 *
 * What it is, how it is selling and what people say, read-mostly: every
 * panel links on to where that thing is changed. One read (`/overview`)
 * carries the product, its panels and its collections; orders, reviews and
 * discounts fail — or are withheld from a role — on their own. Its stock at
 * every storefront comes from the Stock API's levels read, filtered to it;
 * the Stock tab adds its log and checks (Stock's queries). Each of those
 * is optional: one that fails is said where it would have been, never
 * shown as a zero.
 *
 * The tab is in the address (`?tab=stock`; `?tab=variants` still opens it)
 * so a notification, a link in chat or Back lands on the same view.
 *
 * On React Query (DEC-259), loaded in the browser: the gates are decided
 * here, from the product the tab's title reads anyway (`readOverview`: not
 * this business's is this page's 404), with the side reads that hang on
 * it; the product's view (`/api/products/[productId]`) and the Stock tab's
 * log and checks are `ProductContainer`'s queries, read from the browser
 * behind the route's loader.
 */
export default async function ProductPage({
    params,
    searchParams,
}: {
    params: Promise<{ productId: string }>;
    searchParams: Promise<{
        storefront?: string;
        tab?: string;
        orders?: string;
        view?: string;
    }>;
}) {
    await requireSession();
    const [{ productId }, query, organization] = await Promise.all([
        params,
        searchParams,
        resolveActiveOrganization(),
    ]);
    const roleLabel =
        organization?.roleLabel ??
        (organization ? ROLE_WORD[organization.role] : "a member");

    // A role that cannot open products at all is told so, and who can
    // change it — not shown a "not found" that reads like a broken link.
    if (organization?.actions && !organization.actions.includes("store:read")) {
        return (
            <ProductPageFrame>
                <AccessDenied
                    bare
                    {...whoCanChange({
                        thing: "products",
                        business: organization.name,
                        role: knownRoleName(organization),
                    })}
                />
            </ProductPageFrame>
        );
    }

    const tab = productTabOf(query.tab);
    const view = query.view === "customer" ? "customer" : "team";
    // The business's product (#531), as the storefront in the address sees
    // it — or the first that sells it — with its shelves where this view
    // draws them (`lib/products/access.ts`, shared with its read route).
    // Awaited: what else the page reads hangs on it. The same read as the
    // tab's title, so it costs nothing more; the container draws
    // everything from the product's query (DEC-259).
    const ask = productAsk(productId, {
        storefront: query.storefront,
        tab,
        view,
    });
    const [found, business, web, paused] = await Promise.all([
        organization ? readOverview(query.storefront, productId) : null,
        // The business's Track stock switch (#515). Optional: unknown, the
        // product's own switch decides.
        stockTrackingOnce(),
        // Whether the online shop is live (UX-082): null when unread.
        readWebAddressLinks(),
        // Past the plan's products limit (#800): read-only, and why.
        pausedOrNull(),
    ]);
    if (!found) notFound();
    const cut = activeCut(paused, "products");
    const isPaused = pausedByCut(found.product, cut);
    const overview = isPaused ? { ...found, canWrite: false } : found;
    const shopUrl = isPaused
        ? null
        : shopProductUrl(web?.links.shop, overview.product);
    const counts = countsStock(
        overview.product.stockTracked,
        business?.tracked ?? null,
    );
    const onStock = view === "team" && tab === "stock" && counts;
    const onCollections = view === "team" && tab === "collections";
    const onOverview = view === "team" && tab === "overview";
    const [
        categories,
        collections,
        priceHistory,
        allergens,
        waiting,
        shareSetup,
    ] = await Promise.all([
        // The details sheet picks a category; only a writer opens it. The
        // Collections tab says which category put it in an automatic one.
        overview.canWrite || onCollections
            ? listCategories().catch(() => [])
            : Promise.resolve([]),
        // The Collections tab's sizes and its Edit sheet (#524) — optional:
        // without them the cards leave the count out and Edit waits.
        onCollections
            ? listCollections().catch(() => null)
            : Promise.resolve(null),
        // What it and its options have cost (12 Oct 2026), under the
        // Overview. Optional: a read that fails is said in its place.
        onOverview
            ? readPriceHistory("products", productId).catch(() => null)
            : Promise.resolve(undefined),
        // A business that keeps an allergen list sells food: the
        // description card says ingredients, else materials.
        onOverview ? listAllergens().catch(() => null) : Promise.resolve(null),
        // Who waits for it to be back (DEC-174, U24): the Stock tab's
        // "3 people waiting for it". Optional: unread, it is left out.
        view === "team" && tab === "stock"
            ? getWaitingCount(productId)
            : Promise.resolve(null),
        // Share as a post (#1375): only for a page that is live.
        shopUrl ? readShareSetup(web) : Promise.resolve(null),
    ]);
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";

    return (
        <ProductContainer
            skeleton={<Loading />}
            // The Stock tab's log and checks (Stock's queries), asked
            // beside the product; a failed read is said on the tab.
            stockShown={Boolean(onStock)}
            ask={ask}
            tab={tab}
            view={view}
            ordersFilter={query.orders === "recent" ? "recent" : "open"}
            roleLabel={roleLabel}
            cut={cut}
            businessTracks={business?.tracked ?? null}
            webShop={web ? (web.links.shop ?? null) : undefined}
            share={shareSetup}
            canReplyReviews={may("product-review:write")}
            categories={categories}
            collections={collections}
            priceHistory={priceHistory}
            sellsFood={(allergens?.length ?? 0) > 0}
            waiting={waiting}
            now={new Date()}
        />
    );
}
