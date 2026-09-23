import { Badge } from "@saroh/ui/badge";
import { Card } from "@saroh/ui/card";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import type { EditorSection, ProductTab } from "@/lib/products/links";
import { productEditHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { onTheShop, ratingLabel } from "@/lib/products/overview-rules";

import { DraftChecklist } from "./draft-checklist";
import { ProductDetailsCard } from "./overview-details";
import {
    LinkedCard,
    PanelLine,
    ProductStat,
    SectionTitle,
} from "./overview-parts";
import { SheetButton } from "./sheet-button";

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
}: {
    overview: ProductOverview;
    storeId: string;
    href: (tab: ProductTab) => string;
    categories: { id: string; name: string }[];
}) {
    const { product, stock, orders, reviews, discounts } = overview;
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency) ?? amount;
    const edit = (section?: EditorSection) =>
        productEditHref(storeId, product.id, section);
    const tracked = stock.mode === "variant" || stock.product !== null;

    return (
        <div className="flex flex-col gap-8">
            {product.status === "DRAFT" ? (
                <DraftChecklist
                    overview={overview}
                    edit={edit}
                    canWrite={overview.canWrite}
                />
            ) : null}

            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
                <ProductStat
                    label="Can be sold now"
                    value={tracked ? stock.totals.canSell : "—"}
                    hint={
                        tracked
                            ? `${stock.totals.onHand} on hand, ${stock.totals.promised} promised`
                            : "No stock count yet"
                    }
                />
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
                                            : "overflow-hidden rounded-[6px]"
                                    }
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos, outside next/image's allowlist */}
                                    <img
                                        src={img.url}
                                        alt={img.alt}
                                        className={
                                            i === 0
                                                ? "aspect-[4/3] size-full object-cover"
                                                : "aspect-[4/3] w-full object-cover"
                                        }
                                    />
                                    {i === 0 ? (
                                        <span className="absolute left-1.5 top-1.5 rounded-full bg-foreground px-[7px] py-px text-[11px] font-semibold text-background">
                                            Cover
                                        </span>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid place-items-center rounded-[8px] border border-dashed border-border px-4 py-10 text-center text-[12.5px] text-muted-foreground">
                            No photos yet — up to 5, the first is the cover.
                        </div>
                    )}
                    <p className="pb-3 pt-2 text-[11.5px] text-muted-foreground">
                        {product.images.length} of 5 photos
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
