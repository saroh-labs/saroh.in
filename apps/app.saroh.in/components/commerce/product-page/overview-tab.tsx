import { AbsentValue } from "@saroh/ui/absent-value";
import { Card } from "@saroh/ui/card";
import { TextLink } from "@saroh/ui/text-link";

import { formatMoneyMajor } from "@/lib/format/money";
import type { PriceHistoryPage } from "@/lib/price-history/words";
import {
    PRICE_HISTORY_TITLE,
    priceHistoryShown,
} from "@/lib/price-history/words";
import { canStartCounting } from "@/lib/products/editor-stock";
import type { EditorSection, ProductTab } from "@/lib/products/links";
import { productEditHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { websiteSummary } from "@/lib/products/overview-words";
import type { ProductTracking } from "@/lib/products/tracking";
import { canMarkSoldOut } from "@/lib/products/tracking";
import type { ProductStock } from "@/lib/stock/product-stock";

import { PriceHistoryList } from "@/components/shared/price-history/price-history";

import { DraftChecklist } from "./draft-checklist";
import { ProductDetailsCard } from "./overview-details";
import { OverviewDescription, OverviewPhotos } from "./overview-media";
import {
    CardHead,
    LinkedHeadline,
    LinkedLines,
    PanelLine,
    ProductStat,
} from "./overview-parts";
import { AvailabilityCard, VariantsStat } from "./overview-stats";
import { StockSheetButton } from "./sheets/stock-sheet";
import { UntrackedStat } from "./untracked-stat";

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
    shopLive = null,
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
    /** The online shop is live; null when that couldn't be read. */
    shopLive?: boolean | null;
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

            <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
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
                <VariantsStat
                    overview={overview}
                    money={money}
                    // Untracked, the Stock tab is left out of the row: this
                    // card is the way to the variants and their prices.
                    href={tracking.counts ? null : href("stock")}
                    counts={tracking.counts}
                />
                <WebsiteCard
                    overview={overview}
                    onShop={onShop}
                    shopLive={shopLive}
                />
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-start gap-4">
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
                <OverviewPhotos
                    overview={overview}
                    storeId={storeId}
                    photosHref={href("photos")}
                />
            </div>
            <div className="mt-4">
                <OverviewDescription
                    overview={overview}
                    storeId={storeId}
                    shopLive={shopLive}
                    sellsFood={sellsFood}
                />
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
    onShop,
    shopLive,
}: {
    overview: ProductOverview;
    onShop: boolean;
    shopLive: boolean | null;
}) {
    const { placement } = overview;
    if (placement?.status !== "ok") {
        return (
            <Card className="flex min-w-0 flex-col gap-[7px] rounded-[12px] px-[15px] py-[13px]">
                <p className="text-[11.5px] text-muted-foreground">Website</p>
                <PanelLine
                    status={placement?.status ?? "failed"}
                    what="the website's pages"
                />
            </Card>
        );
    }
    const web = websiteSummary(placement.data, onShop, shopLive);
    return (
        <Card className="flex min-w-0 flex-col gap-[7px] rounded-[12px] px-[15px] py-[13px]">
            <p className="text-[11.5px] text-muted-foreground">Website</p>
            <LinkedHeadline>{web.headline}</LinkedHeadline>
            <LinkedLines lines={web.lines} />
            {shopLive === false && overview.canWrite ? (
                <TextLink href="/sites" className="text-[12px]">
                    Set up your shop
                </TextLink>
            ) : null}
        </Card>
    );
}
