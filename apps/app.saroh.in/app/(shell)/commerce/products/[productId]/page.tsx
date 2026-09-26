import { Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductCollectionsTab } from "@/components/commerce/collections/collections-tab";
import { ArchivedBanner } from "@/components/commerce/product-page/archived-banner";
import { CustomerView } from "@/components/commerce/product-page/customer-view";
import { ProductDiscountsTab } from "@/components/commerce/product-page/discounts-tab";
import {
    AccessLine,
    ProductCrumbs,
    ProductHeader,
} from "@/components/commerce/product-page/header";
import { ProductOrdersTab } from "@/components/commerce/product-page/orders-tab";
import { ProductOverviewTab } from "@/components/commerce/product-page/overview-tab";
import {
    ProductPageState,
    stateAction,
} from "@/components/commerce/product-page/page-state";
import { ProductPhotosTab } from "@/components/commerce/product-page/photos-tab";
import { ProductReviewsTab } from "@/components/commerce/product-page/reviews-tab";
import { ProductStockTab } from "@/components/commerce/product-page/stock-tab";
import { ProductTabs } from "@/components/commerce/product-page/tabs";
import { listCollections } from "@/lib/collections/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { productHref, productTabOf } from "@/lib/products/links";
import {
    getProductOverview,
    withStorefrontFallback,
} from "@/lib/products/overview";
import { accessLine } from "@/lib/products/overview-words";
import { listCategories } from "@/lib/products/service";
import { countsStock, trackingControl } from "@/lib/products/tracking";
import { requireSession } from "@/lib/session";
import type { ProductStock } from "@/lib/stock/product-stock";
import { productStock } from "@/lib/stock/product-stock";
import {
    getStockChecks,
    getStockLevels,
    getStockLog,
    getStockTracking,
} from "@/lib/stock/service";

export const metadata = { title: "Product" };

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
 * the Stock tab adds its log and checks. Each of those is optional: one that
 * fails is said where it would have been, never shown as a zero.
 *
 * The tab is in the address (`?tab=stock`; `?tab=variants` still opens it)
 * so a notification, a link in chat or Back lands on the same view.
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
            <ProductPageState
                icon={Lock}
                title="You can't open this product"
                description={`Your role in ${organization.name} is ${roleLabel}, which can't see products. An owner or admin can change that in Team.`}
            >
                <Link href="/" className={stateAction("primary")}>
                    Back to Home
                </Link>
            </ProductPageState>
        );
    }

    const tab = productTabOf(query.tab);
    const view = query.view === "customer" ? "customer" : "team";
    // The business's product (#531), as the storefront in the address sees
    // it — or the first that sells it.
    const [overview, business] = await Promise.all([
        withStorefrontFallback(query.storefront, (at) =>
            getProductOverview(at, productId),
        ),
        // The business's Track stock switch (#515). Optional: unknown, the
        // product's own switch decides.
        getStockTracking().catch(() => null),
    ]);
    if (!overview) notFound();
    const tracking = {
        counts: countsStock(
            overview.product.stockTracked,
            business?.tracked ?? null,
        ),
        business: business?.tracked ?? true,
        control: trackingControl(overview),
    };
    const store = overview.storefront;
    const onStock = view === "team" && tab === "stock" && tracking.counts;

    const onCollections = view === "team" && tab === "collections";
    const [levels, log, checks, categories, collections] = await Promise.all([
        // Its shelves at every storefront — optional: without them, the
        // Overview shows the address's storefront and the Stock tab says
        // it couldn't load.
        tracking.counts &&
        view === "team" &&
        (tab === "overview" || tab === "stock")
            ? getStockLevels({ product: productId }).catch(() => null)
            : Promise.resolve(null),
        onStock
            ? getStockLog({ product: productId, limit: 100 }).catch(() => null)
            : Promise.resolve(null),
        onStock ? getStockChecks().catch(() => null) : Promise.resolve(null),
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
    ]);
    const stock: ProductStock | null = levels
        ? productStock(levels, productId)
        : null;
    const now = new Date();
    const href = (t: Parameters<typeof productHref>[2]) =>
        productHref(store.id, productId, t);
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const access = accessLine({
        roleLabel,
        canWrite: overview.canWrite,
        canStock: overview.canStock,
        canReply: overview.canReply,
    });
    const shortSizes = stock?.sizes.filter((s) => s.short > 0).length ?? 0;
    const lowSizes =
        stock?.sizes.filter((s) =>
            (stock.split ? s.shelves.map((x) => x.word) : [s.word]).some(
                (w) => w.tone === "low" || w.tone === "bad",
            ),
        ).length ?? overview.stock.totals.lowCount;

    return (
        <main className="w-full">
            <ProductCrumbs overview={overview} storeId={store.id} view={view} />
            <ProductHeader
                overview={overview}
                storeId={store.id}
                photosHref={href("photos")}
            />
            {access ? <AccessLine line={access} /> : null}
            {overview.product.status === "ARCHIVED" ? (
                <ArchivedBanner
                    storeId={store.id}
                    productId={overview.product.id}
                    archivedAt={overview.product.archivedAt ?? null}
                    canWrite={overview.canWrite}
                />
            ) : null}
            {view === "customer" ? (
                <div className="px-4 pb-[26px] sm:px-[22px]">
                    <CustomerView
                        overview={overview}
                        storeId={store.id}
                        canWrite={overview.canWrite}
                        counts={tracking.counts}
                        businessTracks={tracking.business}
                    />
                </div>
            ) : (
                <>
                    <ProductTabs
                        overview={overview}
                        active={tab}
                        href={href}
                        counts={tracking.counts}
                        stockBadge={
                            !tracking.counts
                                ? null
                                : shortSizes > 0
                                  ? `${shortSizes} short`
                                  : lowSizes > 0
                                    ? `${lowSizes} low`
                                    : null
                        }
                    />
                    <div
                        role="tabpanel"
                        aria-labelledby={`tab-${tab}`}
                        className="px-4 pb-[26px] pt-5 sm:px-[22px]"
                    >
                        {tab === "overview" ? (
                            <ProductOverviewTab
                                overview={overview}
                                storeId={store.id}
                                href={href}
                                categories={categories}
                                tracking={tracking}
                                stock={stock}
                                now={now}
                            />
                        ) : null}
                        {tab === "stock" ? (
                            <ProductStockTab
                                overview={overview}
                                storeId={store.id}
                                tracking={tracking}
                                stock={stock}
                                log={log ? log.entries.slice(0, 5) : null}
                                week={log ? log.entries : null}
                                checks={
                                    checks?.checks.filter(
                                        (c) => c.productId === productId,
                                    ) ?? []
                                }
                                retryHref={href("stock")}
                                ordersHref={href("orders")}
                                now={now}
                            />
                        ) : null}
                        {tab === "photos" ? (
                            <ProductPhotosTab
                                overview={overview}
                                storeId={store.id}
                            />
                        ) : null}
                        {tab === "reviews" ? (
                            <ProductReviewsTab
                                overview={overview}
                                retryHref={href("reviews")}
                                canReply={may("product-review:write")}
                            />
                        ) : null}
                        {tab === "orders" ? (
                            <ProductOrdersTab
                                overview={overview}
                                storeId={store.id}
                                filter={
                                    query.orders === "recent"
                                        ? "recent"
                                        : "open"
                                }
                            />
                        ) : null}
                        {tab === "discounts" ? (
                            <ProductDiscountsTab
                                overview={overview}
                                retryHref={href("discounts")}
                            />
                        ) : null}
                        {tab === "collections" ? (
                            <ProductCollectionsTab
                                overview={overview}
                                collections={collections}
                                categories={categories}
                                retryHref={href("collections")}
                            />
                        ) : null}
                    </div>
                </>
            )}
        </main>
    );
}
