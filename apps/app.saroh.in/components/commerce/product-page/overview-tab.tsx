import { cn } from "@saroh/ui/lib/utils";

import { formatMoneyMajor } from "@/lib/format/money";
import type { EditorSection, ProductTab } from "@/lib/products/links";
import { productEditHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { discountAmount, ratingLabel } from "@/lib/products/overview-rules";
import {
    collectionsSummary,
    openOrderLine,
    ordersSummary,
    websiteSummary,
} from "@/lib/products/overview-words";
import type { ProductTracking } from "@/lib/products/tracking";
import { canMarkSoldOut } from "@/lib/products/tracking";
import type { ProductStock } from "@/lib/stock/product-stock";

import { DraftChecklist } from "./draft-checklist";
import { ProductDetailsCard } from "./overview-details";
import { OverviewDescription, OverviewPhotos } from "./overview-media";
import {
    LinkedCard,
    LinkedCardLink,
    LinkedHeadline,
    LinkedLines,
    PanelLine,
    ProductStat,
} from "./overview-parts";
import { AvailabilityCard, VariantsStat } from "./overview-stats";
import { UntrackedStat } from "./untracked-stat";

/**
 * The product at a glance (#522): two cards a merchant checks first — what
 * can be sold (or how short it is) and its variants — then what is linked
 * to it, each opening its own tab, its details in two groups, its photos
 * and its words.
 */
export function ProductOverviewTab({
    overview,
    storeId,
    href,
    categories,
    tracking,
    stock,
    now,
}: {
    overview: ProductOverview;
    storeId: string;
    href: (tab: ProductTab) => string;
    categories: { id: string; name: string }[];
    tracking: ProductTracking;
    /** Its shelves at every storefront; null when that read failed. */
    stock: ProductStock | null;
    now: Date;
}) {
    const { product, orders, reviews, discounts, placement } = overview;
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency) ?? amount;
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
                        edit={edit}
                        canWrite={overview.canWrite}
                        counts={tracking.counts}
                    />
                </div>
            ) : null}

            <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
                {tracking.counts ? (
                    counted ? (
                        <AvailabilityCard
                            overview={overview}
                            stock={stock}
                            multi={multi}
                            href={href}
                        />
                    ) : (
                        <ProductStat
                            label="Can be sold now"
                            value="—"
                            hint="No stock count yet"
                        />
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
                    // card is the way to the sizes and their prices.
                    href={tracking.counts ? null : href("stock")}
                />
            </div>

            <h2 className="mb-2.5 mt-1 font-display text-[15px] font-semibold tracking-[-0.015em]">
                Linked to this product
            </h2>
            <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
                <LinkedCard title="Orders" href={href("orders")}>
                    {orders.status === "ok" ? (
                        <>
                            <LinkedHeadline>
                                {ordersSummary(
                                    orders.data.openCount,
                                    orders.data.thisMonthCount,
                                    now,
                                )}
                            </LinkedHeadline>
                            <LinkedLines
                                lines={orders.data.recent
                                    .filter((o) => o.open)
                                    .slice(0, 3)
                                    .map((o) => openOrderLine(o, product.name))}
                            />
                        </>
                    ) : (
                        <PanelLine
                            status={orders.status}
                            what="orders"
                            retryHref={href("overview")}
                        />
                    )}
                </LinkedCard>
                <LinkedCard title="Discounts" href={href("discounts")}>
                    {discounts.status === "ok" ? (
                        (() => {
                            const live = discounts.data.filter(
                                (d) => d.state === "ACTIVE",
                            );
                            return (
                                <>
                                    <LinkedHeadline>
                                        {live.length}{" "}
                                        {live.length === 1
                                            ? "applies"
                                            : "apply"}{" "}
                                        now
                                    </LinkedHeadline>
                                    <LinkedLines
                                        lines={live.map(
                                            (d) =>
                                                `${d.code} — ${d.description ?? discountAmount(d, money)}`,
                                        )}
                                    />
                                </>
                            );
                        })()
                    ) : (
                        <PanelLine status={discounts.status} what="discounts" />
                    )}
                </LinkedCard>
                <LinkedCard title="Collections" href={href("collections")}>
                    {placement?.status === "ok" ? (
                        <>
                            <LinkedHeadline>
                                {collectionsSummary(placement.data).count}
                            </LinkedHeadline>
                            <p className="text-[12px] leading-[1.45] text-muted-foreground">
                                {collectionsSummary(placement.data).names}
                            </p>
                        </>
                    ) : (
                        <PanelLine
                            status={placement?.status ?? "failed"}
                            what="collections"
                        />
                    )}
                </LinkedCard>
                <LinkedCard title="Website" href={href("collections")}>
                    {placement?.status === "ok" ? (
                        <>
                            <LinkedHeadline>
                                {websiteSummary(placement.data).headline}
                            </LinkedHeadline>
                            <LinkedLines
                                lines={websiteSummary(placement.data).lines}
                            />
                        </>
                    ) : (
                        <PanelLine
                            status={placement?.status ?? "failed"}
                            what="the website's pages"
                        />
                    )}
                </LinkedCard>
                <LinkedCardLink title="Reviews" href={href("reviews")}>
                    {reviews.status === "ok" ? (
                        <>
                            <span className="text-[14px] font-semibold">
                                {ratingLabel(reviews.data.summary) ??
                                    "No reviews yet"}
                            </span>
                            <span
                                className={cn(
                                    "text-[12px] leading-[1.45]",
                                    reviews.data.toAnswer > 0
                                        ? "text-brand"
                                        : "text-muted-foreground",
                                )}
                            >
                                {reviews.data.toAnswer > 0
                                    ? `${reviews.data.toAnswer} waiting for a reply`
                                    : reviews.data.summary.count > 0
                                      ? "All answered"
                                      : "Only people who bought it can review it"}
                            </span>
                        </>
                    ) : (
                        <PanelLine status={reviews.status} what="reviews" />
                    )}
                </LinkedCardLink>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-start gap-4">
                <ProductDetailsCard
                    overview={overview}
                    storeId={storeId}
                    categories={categories}
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
                <OverviewDescription overview={overview} storeId={storeId} />
            </div>
        </div>
    );
}
