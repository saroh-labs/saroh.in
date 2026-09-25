import { Badge } from "@saroh/ui/badge";
import { Card } from "@saroh/ui/card";
import Link from "next/link";

import { MediaThumb } from "@/components/commerce/product-sections/media-thumb";
import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import { mediaCounter } from "@/lib/products/editor-sections";
import type { EditorSection, ProductTab } from "@/lib/products/links";
import { productEditHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { onTheShop, ratingLabel } from "@/lib/products/overview-rules";
import type { ProductTracking } from "@/lib/products/tracking";
import {
    BUSINESS_NOT_TRACKING,
    TRACKING_LOCKED,
} from "@/lib/products/tracking";

import { DraftChecklist } from "./draft-checklist";
import { ProductDetailsCard } from "./overview-details";
import {
    LinkedCard,
    PanelLine,
    ProductStat,
    SectionTitle,
} from "./overview-parts";
import { SheetButton } from "./sheet-button";
import { StartTrackingButton } from "./tracking-actions";

/**
 * The product at a glance. Four numbers a merchant checks first, what is
 * linked to it (each read-only here, with its own tab), everything about it
 * with a tag saying whether customers see it, its photos and its words.
 */
export function ProductOverviewTab({
    overview,
    storeId,
    href,
    categories,
    tracking,
}: {
    overview: ProductOverview;
    storeId: string;
    href: (tab: ProductTab) => string;
    categories: { id: string; name: string }[];
    tracking: ProductTracking;
}) {
    const { product, stock, orders, reviews, discounts } = overview;
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency) ?? amount;
    const edit = (section?: EditorSection) =>
        productEditHref(storeId, product.id, section);
    const tracked =
        tracking.counts && (stock.mode === "variant" || stock.product !== null);

    return (
        <div className="flex flex-col gap-8">
            {product.status === "DRAFT" ? (
                <DraftChecklist
                    overview={overview}
                    edit={edit}
                    canWrite={overview.canWrite}
                    counts={tracking.counts}
                />
            ) : null}

            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
                {tracking.counts ? (
                    <ProductStat
                        label="Can be sold now"
                        value={tracked ? stock.totals.canSell : "—"}
                        hint={
                            tracked
                                ? `${stock.totals.onHand} on hand, ${stock.totals.promised} promised`
                                : "No stock count yet"
                        }
                    />
                ) : (
                    <UntrackedStat
                        tracking={tracking}
                        productId={product.id}
                        storeId={storeId}
                    />
                )}
                <ProductStat
                    label="Variants"
                    value={product.variants.length || "—"}
                    hint={
                        product.variants.length
                            ? product.variants
                                  .slice(0, 3)
                                  .map(
                                      (v) =>
                                          `${v.title} ${money(v.price ?? product.price)}`,
                                  )
                                  .join(" · ")
                            : "Sold as itself"
                    }
                />
                <ProductStat
                    label="Last changed"
                    value={
                        <ViewerDate
                            iso={overview.lastChanged}
                            variant="dayMonth"
                        />
                    }
                    hint={
                        <ViewerDate iso={overview.lastChanged} variant="time" />
                    }
                />
                <Link
                    href={href("reviews")}
                    className="rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ProductStat
                        className="h-full transition-colors hover:border-border-strong"
                        label="Reviews"
                        value={
                            reviews.status === "ok"
                                ? (ratingLabel(reviews.data.summary) ?? "—")
                                : "—"
                        }
                        hint={
                            reviews.status === "ok" ? (
                                reviews.data.summary.count === 0 ? (
                                    "None yet"
                                ) : reviews.data.toAnswer > 0 ? (
                                    <span className="text-brand">
                                        {reviews.data.toAnswer} waiting for a
                                        reply
                                    </span>
                                ) : (
                                    "All answered"
                                )
                            ) : reviews.status === "failed" ? (
                                "Couldn't load reviews"
                            ) : (
                                "Your role can't see reviews"
                            )
                        }
                    />
                </Link>
            </div>

            <section className="flex flex-col gap-3">
                <SectionTitle
                    title="Linked to this product"
                    aside="Read-only here. Each has its own tab, and links on to where it is managed."
                />
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
                    <LinkedCard title="Orders" href={href("orders")}>
                        {orders.status === "ok" ? (
                            <>
                                <p className="text-[14px] font-semibold">
                                    {orders.data.openCount} open ·{" "}
                                    {orders.data.thisMonthCount} this month
                                </p>
                                {orders.data.recent
                                    .filter((o) => o.open)
                                    .slice(0, 3)
                                    .map((o) => (
                                        <p
                                            key={o.id}
                                            className="text-[12px] text-muted-foreground"
                                        >
                                            {o.orderNumber} {o.customer} —{" "}
                                            {o.lines
                                                .map(
                                                    (l) =>
                                                        `${l.title || product.name} × ${l.quantity}`,
                                                )
                                                .join(", ")}
                                        </p>
                                    ))}
                            </>
                        ) : (
                            <PanelLine status={orders.status} what="orders" />
                        )}
                    </LinkedCard>
                    <LinkedCard title="Reviews" href={href("reviews")}>
                        {reviews.status === "ok" ? (
                            <>
                                <p className="text-[14px] font-semibold">
                                    {ratingLabel(reviews.data.summary) ??
                                        "No reviews yet"}
                                </p>
                                <p
                                    className={
                                        reviews.data.toAnswer > 0
                                            ? "text-[12px] text-brand"
                                            : "text-[12px] text-muted-foreground"
                                    }
                                >
                                    {reviews.data.toAnswer > 0
                                        ? `${reviews.data.toAnswer} waiting for a reply`
                                        : reviews.data.summary.count > 0
                                          ? "Every review has a reply or is answered"
                                          : "Only people who bought it can review it"}
                                </p>
                            </>
                        ) : (
                            <PanelLine status={reviews.status} what="reviews" />
                        )}
                    </LinkedCard>
                    <LinkedCard title="Discounts" href={href("discounts")}>
                        {discounts.status === "ok" ? (
                            <>
                                <p className="text-[14px] font-semibold">
                                    {
                                        discounts.data.filter(
                                            (d) => d.state === "ACTIVE",
                                        ).length
                                    }{" "}
                                    apply now
                                </p>
                                {discounts.data
                                    .filter((d) => d.state === "ACTIVE")
                                    .slice(0, 2)
                                    .map((d) => (
                                        <p
                                            key={d.id}
                                            className="font-mono text-[12px] text-muted-foreground"
                                        >
                                            {d.code}
                                        </p>
                                    ))}
                            </>
                        ) : (
                            <PanelLine
                                status={discounts.status}
                                what="discounts"
                            />
                        )}
                    </LinkedCard>
                </div>
                {tracked ? (
                    <p className="text-pretty text-[11.5px] text-muted-foreground">
                        {promisedLine(stock.totals.promised, orders)}
                    </p>
                ) : null}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
                <ProductDetailsCard
                    overview={overview}
                    storeId={storeId}
                    categories={categories}
                />

                <Card className="flex min-w-0 flex-col self-start rounded-[12px] px-4 pb-1 pt-3.5">
                    <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
                        <h2 className="flex-1 text-[12.5px] text-muted-foreground">
                            Photos
                        </h2>
                        {overview.canWrite ? (
                            <SheetButton
                                kind="photos"
                                label="Edit"
                                ariaLabel="Edit photos"
                                product={product}
                                storeId={storeId}
                            />
                        ) : null}
                        <Link
                            href={href("photos")}
                            className="text-[12px] text-brand hover:text-foreground"
                        >
                            See all
                        </Link>
                    </div>
                    {product.images.length > 0 ? (
                        <div className="grid grid-cols-[2fr_1fr_1fr] gap-1.5">
                            {product.images.slice(0, 5).map((img, i) => (
                                <div
                                    key={img.id}
                                    className={
                                        i === 0
                                            ? "relative row-span-2 overflow-hidden rounded-[8px]"
                                            : "relative aspect-[4/3] overflow-hidden rounded-[6px]"
                                    }
                                >
                                    <MediaThumb
                                        item={img}
                                        alt={img.alt}
                                        small={i > 0}
                                        className={
                                            i === 0 ? "aspect-[4/3]" : undefined
                                        }
                                    />
                                    {i === 0 && img.kind !== "video" ? (
                                        <span className="absolute left-1.5 top-1.5 rounded-full bg-foreground px-[7px] py-px text-[11px] font-semibold text-background">
                                            Cover
                                        </span>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid place-items-center rounded-[8px] border border-dashed border-border px-4 py-10 text-center text-[12.5px] text-muted-foreground">
                            No photos yet — up to 15 photos and 3 videos; the
                            first photo is the cover.
                        </div>
                    )}
                    <p className="pb-3 pt-2 text-[11.5px] text-muted-foreground">
                        {mediaCounter(product.images)}
                    </p>
                </Card>
            </div>

            <section className="flex flex-col gap-3">
                <SectionTitle
                    title="Description and ingredients"
                    action={
                        overview.canWrite ? (
                            <SheetButton
                                kind="description"
                                label="Edit"
                                ariaLabel="Edit description"
                                product={product}
                                storeId={storeId}
                            />
                        ) : null
                    }
                />
                <Card className="max-w-[70ch] rounded-[12px] px-5 py-4">
                    {product.description ? (
                        <div
                            className="prose prose-sm max-w-none text-foreground dark:prose-invert"
                            // Sanitised by the API on every save (#461).
                            dangerouslySetInnerHTML={{
                                __html: product.description,
                            }}
                        />
                    ) : (
                        <p className="text-[13.5px] text-muted-foreground">
                            No description yet.
                        </p>
                    )}
                    {product.keyPoints.length > 0 ? (
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-[13.5px]">
                            {product.keyPoints.map((p) => (
                                <li key={p}>{p}</li>
                            ))}
                        </ul>
                    ) : null}
                </Card>
                <Card className="max-w-[calc(70ch+40px)] rounded-[12px] px-[18px] py-1">
                    <dl className="text-[13.5px]">
                        <div className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-baseline gap-3 py-[11px]">
                            <dt className="text-[12.5px] text-muted-foreground">
                                Ingredients or material
                            </dt>
                            <dd className="min-w-0 break-words">
                                {product.materials ?? (
                                    <span className="text-muted-foreground">
                                        Not given.
                                    </span>
                                )}
                            </dd>
                            {product.materials ? (
                                onTheShop(product.shopFields, "materials") ? (
                                    <Badge
                                        variant="success"
                                        className="rounded-full px-[7px] py-px text-[11px] font-semibold"
                                    >
                                        On the shop
                                    </Badge>
                                ) : (
                                    <Badge
                                        variant="neutral"
                                        className="rounded-full px-[7px] py-px text-[11px] font-semibold"
                                    >
                                        Team only
                                    </Badge>
                                )
                            ) : (
                                <span />
                            )}
                        </div>
                    </dl>
                </Card>
            </section>
        </div>
    );
}

/**
 * The design's untracked card: "Stock / Not tracked / Always available on
 * the shop." Track stock is Owner/Admin's, and only while the business
 * tracks stock; a stock-only role is told why it can't.
 */
function UntrackedStat({
    tracking,
    productId,
    storeId,
}: {
    tracking: ProductTracking;
    productId: string;
    storeId: string;
}) {
    return (
        <Card className="rounded-[12px] px-[15px] py-[13px]">
            <p className="text-[11.5px] text-muted-foreground">Stock</p>
            <p className="mt-1 font-display text-[18px] font-semibold leading-tight">
                Not tracked
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                Always available on the shop.
            </p>
            {!tracking.business ? (
                <p className="mt-2 text-pretty text-[11.5px] text-muted-foreground">
                    {BUSINESS_NOT_TRACKING}
                </p>
            ) : tracking.control === "change" ? (
                <StartTrackingButton productId={productId} storeId={storeId} />
            ) : tracking.control === "locked" ? (
                <p className="mt-2 text-pretty text-[11.5px] text-muted-foreground">
                    {TRACKING_LOCKED}
                </p>
            ) : null}
        </Card>
    );
}

/** What the promised stock is, and which open orders hold it. */
function promisedLine(
    promised: number,
    orders: ProductOverview["orders"],
): string {
    if (orders.status !== "ok") {
        return `Promised stock (${promised}) comes from the product itself, so it is still right while orders are down.`;
    }
    if (promised === 0) return "Nothing is promised to an open order.";
    const open = orders.data.recent.filter((o) => o.open);
    // Older open orders than the recent ones read here can hold stock too.
    if (open.length === 0)
        return `${promised} ${promised === 1 ? "is" : "are"} promised to open orders.`;
    const held = open
        .map(
            (o) =>
                `${o.orderNumber} (${o.lines.reduce((n, l) => n + l.quantity, 0)})`,
        )
        .join(", ");
    return `The ${promised} promised in stock ${promised === 1 ? "is" : "are"} ${
        open.length === 1
            ? "this open order"
            : `these ${open.length} open orders`
    }: ${held}.`;
}
