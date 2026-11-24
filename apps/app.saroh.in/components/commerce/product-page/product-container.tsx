"use client";

import type { ComponentProps } from "react";

import { PausedNote } from "@/components/billing/paused-banner";
import { ProductCollectionsTab } from "@/components/commerce/collections/collections-tab";
import { ProductOverviewTab } from "@/components/commerce/product-overview/overview-tab";
import { ArchivedBanner } from "@/components/commerce/product-page/archived-banner";
import { CustomerView } from "@/components/commerce/product-page/customer-view";
import { ProductDiscountsTab } from "@/components/commerce/product-page/discounts-tab";
import {
    AccessLine,
    ProductHeader,
} from "@/components/commerce/product-page/header";
import { ProductOrdersTab } from "@/components/commerce/product-page/orders-tab";
import { ProductPhotosTab } from "@/components/commerce/product-page/photos-tab";
import { ProductTabs } from "@/components/commerce/product-page/tabs";
import { ProductReviewsTab } from "@/components/commerce/product-reviews/reviews-tab";
import { ProductStockTab } from "@/components/commerce/product-stock/stock-tab";
import {
    ProductSavedContext,
    QuickEditsContext,
} from "@/components/commerce/quick-edits/quick-edits";
import type { PausedCut } from "@/lib/billing/paused";
import { pausedByCut, pausedWords } from "@/lib/billing/paused";
import { formatMoneyMajor } from "@/lib/format/money";
import type { ProductTab } from "@/lib/products/links";
import { productHref } from "@/lib/products/links";
import { priceLabel, stockBadge } from "@/lib/products/overview-rules";
import { accessLine, shopProductUrl } from "@/lib/products/overview-words";
import type { ProductAsk } from "@/lib/products/queries";
import { countsStock, trackingControl } from "@/lib/products/tracking";
import {
    useProduct,
    useProductsSaved,
    useQuickEditsHost,
} from "@/lib/products/use-products";
import type { ShareSetup } from "@/lib/share-item/share";
import { ALL_CHECKS, productLogAsk } from "@/lib/stock/queries";
import { useStockChecks, useStockLog } from "@/lib/stock/use-stock";

type StockTab = ComponentProps<typeof ProductStockTab>;
type OverviewTab = ComponentProps<typeof ProductOverviewTab>;

/**
 * One product's page on React Query (DEC-259): the header, the tabs and
 * every tab body draw from the product's query (its overview, and its
 * shelves where shown), so a quick edit (archive, publish, add stock,
 * price) shows at once everywhere on the page and a sheet's save reads it
 * again, never the whole page. The Stock tab's log and checks are Stock's
 * queries, read again with the product after a stock change there. What
 * only the server reads for a tab (price history, collections) comes in as
 * props.
 */
export function ProductContainer({
    ask,
    tab,
    view,
    ordersFilter,
    roleLabel,
    cut,
    businessTracks,
    webShop,
    share: shareSetup,
    canReplyReviews,
    categories,
    collections,
    priceHistory,
    sellsFood,
    waiting,
    now,
}: {
    ask: ProductAsk;
    tab: ProductTab;
    view: "team" | "customer";
    ordersFilter: "open" | "recent";
    roleLabel: string;
    /** What a lower plan paused (#800): this product read-only past it. */
    cut: PausedCut;
    /** The business's Track stock switch; null when unread. */
    businessTracks: boolean | null;
    /** The online shop's address; null: none; undefined: unread. */
    webShop: string | null | undefined;
    share: ShareSetup | null;
    canReplyReviews: boolean;
    categories: ComponentProps<typeof ProductCollectionsTab>["categories"];
    collections: ComponentProps<typeof ProductCollectionsTab>["collections"];
    priceHistory: OverviewTab["priceHistory"];
    sellsFood: boolean;
    waiting: StockTab["waiting"];
    now: Date;
}) {
    const saved = useProductsSaved();
    const quick = useQuickEditsHost();
    const { data } = useProduct(ask);
    // The Stock tab's log and checks, only while it shows a counted product.
    const onStock =
        tab === "stock" &&
        view === "team" &&
        !!data &&
        countsStock(data.overview.product.stockTracked, businessTracks);
    const logRead = useStockLog(productLogAsk(ask.productId), onStock);
    const checksRead = useStockChecks(ALL_CHECKS, onStock);
    // Hydrated by the page, so only a failed read again is missing: the
    // last answer stays (react-query keeps it), the segment says the rest.
    if (!data) return null;

    const read = data.overview;
    const isPaused = pausedByCut(read.product, cut);
    // Read-only as the Editor is (#800): nothing on the page changes it,
    // while stock can still be counted (`canStock` is kept).
    const overview = isPaused ? { ...read, canWrite: false } : read;
    // Paused, it is hidden from the site: nothing to open there (#800).
    const shopUrl = isPaused ? null : shopProductUrl(webShop, overview.product);
    // Whether the online shop is live at all; null when that is unread (a
    // role that can't read the web address), so nothing is claimed.
    const shopLive = webShop === undefined ? null : Boolean(webShop);
    const tracking = {
        counts: countsStock(overview.product.stockTracked, businessTracks),
        business: businessTracks ?? true,
        control: trackingControl(overview),
    };
    const store = overview.storefront;
    // Unread, the tab says its changes couldn't be shown (null).
    const log = logRead.data?.entries ?? null;
    const stock = data.stock;
    // The Offer card: a discount set on this product that is live now.
    const offer =
        overview.discounts.status === "ok"
            ? overview.discounts.data.find(
                  (d) => d.state === "ACTIVE" && d.appliesTo === "PRODUCT",
              )
            : undefined;
    const share =
        shareSetup && shopUrl && overview.product.slug
            ? {
                  setup: shareSetup,
                  item: {
                      kind: "product" as const,
                      ref: overview.product.slug,
                      name: overview.product.name,
                      price: priceLabel(overview.price, (amount) =>
                          formatMoneyMajor(amount, overview.product.currency),
                      ),
                      url: shopUrl,
                      offerId: offer?.id ?? null,
                      // Photo and Price tag need its own photo (cardsFor).
                      hasPhoto: overview.product.images.length > 0,
                  },
              }
            : null;
    const href = (t: Parameters<typeof productHref>[2]) =>
        productHref(store.id, overview.product.id, t);
    const access = accessLine({
        roleLabel,
        canWrite: overview.canWrite,
        canStock: overview.canStock,
        canReply: overview.canReply,
    });

    return (
        <QuickEditsContext.Provider value={quick}>
            <ProductSavedContext.Provider value={saved}>
                {/* A phone docks the header's buttons at the foot: room for them. */}
                <main
                    className={
                        overview.canWrite ? "w-full max-sm:pb-16" : "w-full"
                    }
                >
                    <ProductHeader
                        overview={overview}
                        storeId={store.id}
                        photosHref={href("photos")}
                        paused={isPaused}
                        view={view}
                        shopUrl={shopUrl}
                        shopLive={shopLive}
                        share={share}
                    />
                    {isPaused ? (
                        <div className="border-b border-border px-4 py-2.5 sm:px-[22px]">
                            <PausedNote hiddenPlans="Paused: over your plan's product limit. Contact us to bring it back.">
                                {pausedWords("product")}
                            </PausedNote>
                        </div>
                    ) : access ? (
                        <AccessLine line={access} />
                    ) : null}
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
                                categories={categories}
                                shelves={stock}
                            />
                        </div>
                    ) : (
                        <>
                            <ProductTabs
                                overview={overview}
                                active={tab}
                                href={href}
                                counts={tracking.counts}
                                // From the one read every tab makes: the
                                // levels load only on Overview and Stock,
                                // and a badge built from them changed with
                                // the tab.
                                stockBadge={stockBadge(
                                    overview.stock,
                                    tracking.counts,
                                )}
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
                                        onShop={shopUrl !== null}
                                        shopUrl={shopUrl}
                                        shopLive={shopLive}
                                        paused={isPaused}
                                        sellsFood={sellsFood}
                                        priceHistory={priceHistory}
                                    />
                                ) : null}
                                {tab === "stock" ? (
                                    <ProductStockTab
                                        overview={overview}
                                        storeId={store.id}
                                        tracking={tracking}
                                        stock={stock}
                                        log={log ? log.slice(0, 5) : null}
                                        week={log}
                                        checks={
                                            checksRead.data?.checks.filter(
                                                (c) =>
                                                    c.productId ===
                                                    overview.product.id,
                                            ) ?? []
                                        }
                                        retryHref={href("stock")}
                                        ordersHref={href("orders")}
                                        now={now}
                                        waiting={waiting}
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
                                        canReply={canReplyReviews}
                                    />
                                ) : null}
                                {tab === "orders" ? (
                                    <ProductOrdersTab
                                        overview={overview}
                                        storeId={store.id}
                                        filter={ordersFilter}
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
                                        onShop={shopUrl !== null}
                                    />
                                ) : null}
                            </div>
                        </>
                    )}
                </main>
            </ProductSavedContext.Provider>
        </QuickEditsContext.Provider>
    );
}
