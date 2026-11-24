import { AbsentValue } from "@saroh/ui/absent-value";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { IntentLink } from "@saroh/ui/intent-link";
import { ExternalLink, Eye } from "lucide-react";

import { formatMoneyMajor } from "@/lib/format/money";
import type { PriceHistoryPage } from "@/lib/price-history/words";
import {
    PRICE_HISTORY_TITLE,
    priceHistoryShown,
} from "@/lib/price-history/words";
import { canStartCounting } from "@/lib/products/editor-stock";
import type { EditorSection, ProductTab } from "@/lib/products/links";
import { productEditHref, productHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { visibilityLine, websiteSummary } from "@/lib/products/overview-words";
import type { ProductTracking } from "@/lib/products/tracking";
import { canMarkSoldOut } from "@/lib/products/tracking";
import type { ProductStock } from "@/lib/stock/product-stock";

import { PriceHistoryList } from "@/components/shared/price-history/price-history";

import { StockSheetButton } from "@/components/commerce/product-stock/stock-sheet";
import { UntrackedStat } from "@/components/commerce/product-stock/untracked-stat";
import { DraftChecklist } from "./draft-checklist";
import { ProductDetailsCard } from "./overview-details";
import { OverviewDescription, OverviewPhotos } from "./overview-media";
import {
    CardHead,
    LinkedLines,
    PanelLine,
    ProductStat,
} from "./overview-parts";
import { AvailabilityCard, sizeRows, VariantsStat } from "./overview-stats";

/**
 * The product at a glance (#522): the cards a merchant checks first — what
 * is to sell (with what is out or low, and its fix), its variants, and
 * whether the website shows it — then its details in two groups, its
 * photos and its words. Orders, reviews, discounts and collections are
 * the tabs above, whose badges carry their headline: the Overview no
 * longer repeats them as cards (Products audit, 16 Oct 2026). Last, what
 * it and its options have cost (12 Oct 2026), once there is a change.
 */
export function ProductOverviewTab({
    overview,
    storeId,
    href,
    categories,
    tracking,
    stock,
    onShop = false,
    shopUrl = null,
    shopLive = null,
    paused = false,
    sellsFood = false,
    priceHistory,
}: {
    overview: ProductOverview;
    storeId: string;
    href: (tab: ProductTab) => string;
    categories: { id: string; name: string }[];
    tracking: ProductTracking;
    /** Its shelves at every storefront; null when that read failed. */
    stock: ProductStock | null;
    /** Live on the online shop (UX-082): the Website card says so. */
    onShop?: boolean;
    /** Its live shop page, for View on the shop; null when none. */
    shopUrl?: string | null;
    /** The online shop is live; null when that couldn't be read. */
    shopLive?: boolean | null;
    /** Paused by the plan (#800): the status sentence says so. */
    paused?: boolean;
    /** The business keeps an allergen list: it sells food. */
    sellsFood?: boolean;
    /**
     * What it and its options have cost, newest first; null when that read
     * failed. Left out, the section isn't drawn.
     */
    priceHistory?: PriceHistoryPage | null;
}) {
    const { product } = overview;
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency);
    const edit = (section?: EditorSection) =>
        productEditHref(storeId, product.id, section);
    const counted =
        overview.stock.mode === "variant" || overview.stock.product !== null;
    const multi = (product.storefronts ?? []).length > 1;

    return (
        <div className="flex flex-col">
            {product.status === "DRAFT" ? (
                <div className="mb-4">
                    <DraftChecklist
                        overview={overview}
                        storeId={storeId}
                        edit={edit}
                        canWrite={overview.canWrite}
                        counts={tracking.counts}
                        shelves={stock}
                        categories={categories}
                    />
                </div>
            ) : null}

            {/* Two columns (HPProductDesk): the stock and how it's sold on
                the left; the website, variants, photos and words on the
                right. One column below 1100px. */}
            <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                <div className="grid min-w-0 content-start gap-4">
                    {tracking.counts ? (
                        counted ? (
                            <AvailabilityCard
                                overview={overview}
                                storeId={storeId}
                                stock={stock}
                                multi={multi}
                                href={href}
                            />
                        ) : (
                            <ProductStat
                                label="To sell"
                                value={<AbsentValue says="Not set" />}
                                hint="No stock count yet"
                            >
                                {canStartCounting(
                                    overview,
                                    product.variants.length,
                                ) ? (
                                    <div className="mt-2">
                                        <StockSheetButton
                                            overview={overview}
                                            storeId={storeId}
                                            stock={stock}
                                            counts
                                            label="Add stock"
                                            size="sm"
                                            icon={false}
                                        />
                                    </div>
                                ) : null}
                            </ProductStat>
                        )
                    ) : (
                        <UntrackedStat
                            tracking={tracking}
                            productId={product.id}
                            storeId={storeId}
                            places={product.storefronts ?? []}
                            canMark={canMarkSoldOut(overview)}
                        />
                    )}
                    <ProductDetailsCard
                        overview={overview}
                        storeId={storeId}
                        categories={categories}
                        shopLive={shopLive}
                        stock={
                            !tracking.business
                                ? null
                                : !tracking.counts
                                  ? "untracked"
                                  : multi
                                    ? "tracked-per-storefront"
                                    : "tracked"
                        }
                    />
                </div>
                <div className="grid min-w-0 content-start gap-4">
                    <WebsiteCard
                        overview={overview}
                        storeId={storeId}
                        onShop={onShop}
                        shopUrl={shopUrl}
                        shopLive={shopLive}
                        paused={paused}
                    />
                    {/* The sizes' own table says them when each is counted
                        on its own (HPProductVariantsDesk). */}
                    {tracking.counts &&
                    sizeRows(overview, stock, product.status === "ARCHIVED")
                        .length > 0 ? null : (
                        <VariantsStat
                            overview={overview}
                            money={money}
                            // Untracked, the Stock tab is left out of the row: this
                            // card is the way to the variants and their prices.
                            href={tracking.counts ? null : href("stock")}
                            counts={tracking.counts}
                        />
                    )}
                    <OverviewPhotos
                        overview={overview}
                        storeId={storeId}
                        photosHref={href("photos")}
                    />
                    <OverviewDescription
                        overview={overview}
                        storeId={storeId}
                        shopLive={shopLive}
                        sellsFood={sellsFood}
                    />
                </div>
            </div>
            {priceHistoryShown(priceHistory) ? (
                <Card className="mt-4 rounded-[12px] p-0">
                    <CardHead title={PRICE_HISTORY_TITLE} />
                    <div className="px-[18px] pb-3">
                        <PriceHistoryList history={priceHistory} />
                    </div>
                </Card>
            ) : null}
        </div>
    );
}

/**
 * Whether the website shows it, in its own words (not the Collections
 * tab): "On the online shop", or "Not online yet" with the way to set the
 * shop up while it isn't live.
 */
function WebsiteCard({
    overview,
    storeId,
    onShop,
    shopUrl,
    shopLive,
    paused,
}: {
    overview: ProductOverview;
    storeId: string;
    onShop: boolean;
    shopUrl: string | null;
    shopLive: boolean | null;
    paused: boolean;
}) {
    const { placement, product } = overview;
    const web =
        placement?.status === "ok"
            ? websiteSummary(placement.data, onShop, shopLive)
            : null;
    const customer = `${productHref(storeId, product.id)}&view=customer`;
    // The shop page and the Customer view live here, where the reason
    // they're off is written (HPProductDesk), not in the header.
    return (
        <Card className="flex min-w-0 flex-col gap-2.5 rounded-[12px] px-4 py-3.5">
            <div className="flex items-center gap-2">
                <p
                    data-ph-unmask=""
                    className="mr-auto text-[14px] font-semibold"
                >
                    On your website
                </p>
                {web ? (
                    <Badge variant={onShop ? "success" : "neutral"} size="sm">
                        {onShop ? "Online" : web.headline}
                    </Badge>
                ) : null}
            </div>
            {/* Online, the header already says it; the card lists where. */}
            {onShop ? null : (
                <p
                    data-ph-unmask=""
                    className="text-pretty text-[13px] text-foreground"
                >
                    {visibilityLine(product.status, shopLive, paused)}
                </p>
            )}
            {web ? (
                <LinkedLines
                    lines={onShop ? [web.headline, ...web.lines] : web.lines}
                />
            ) : (
                <PanelLine
                    status={
                        placement?.status === "forbidden"
                            ? "forbidden"
                            : "failed"
                    }
                    what="the website's pages"
                />
            )}
            <div className="flex flex-wrap gap-2">
                {shopLive === false && overview.canWrite ? (
                    <Button asChild size="sm">
                        <IntentLink data-ph-unmask="" href="/sites">
                            Set up your shop
                        </IntentLink>
                    </Button>
                ) : null}
                {shopUrl ? (
                    <Button asChild size="sm" variant="outline">
                        <a
                            href={shopUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="View on the shop, opens in a new tab"
                        >
                            View on the shop
                            <ExternalLink aria-hidden className="size-3.5" />
                        </a>
                    </Button>
                ) : null}
                <Button asChild size="sm" variant="outline">
                    <IntentLink
                        data-ph-unmask=""
                        href={customer}
                        scroll={false}
                    >
                        <Eye aria-hidden className="size-3.5" />
                        Preview as a customer
                    </IntentLink>
                </Button>
            </div>
        </Card>
    );
}
