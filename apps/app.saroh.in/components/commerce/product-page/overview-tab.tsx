import { Badge } from "@saroh/ui/badge";
import { Card } from "@saroh/ui/card";
import { StatCard } from "@saroh/ui/stat-card";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import type { EditorSection, ProductTab } from "@/lib/products/links";
import { productEditHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { plural, ratingLabel } from "@/lib/products/overview-rules";

import { DraftChecklist } from "./draft-checklist";
import { ProductDetailsCard } from "./overview-details";
import {
    EditLink,
    LinkedCard,
    PanelLine,
    SectionTitle,
} from "./overview-parts";

/**
 * The product at a glance. Four numbers a merchant checks first, what is
 * linked to it (each read-only here, with its own tab), everything about it
 * with a tag saying whether customers see it, its photos and its words.
 */
export function ProductOverviewTab({
    overview,
    storeId,
    href,
}: {
    overview: ProductOverview;
    storeId: string;
    href: (tab: ProductTab) => string;
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
                <StatCard
                    label="Can be sold now"
                    value={tracked ? stock.totals.canSell : "—"}
                    hint={
                        tracked
                            ? `${stock.totals.onHand} on hand, ${stock.totals.promised} promised`
                            : "No stock count yet"
                    }
                />
                <StatCard
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
                <StatCard
                    label="Last changed"
                    value={<ViewerDate iso={overview.lastChanged} />}
                    hint="Its name, price or details"
                />
                <Link
                    href={href("reviews")}
                    className="rounded-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <StatCard
                        className="h-full transition-colors hover:border-border-strong"
                        label="Reviews"
                        value={
                            reviews.status === "ok"
                                ? (ratingLabel(reviews.data.summary) ?? "—")
                                : "—"
                        }
                        hint={
                            reviews.status === "ok"
                                ? reviews.data.summary.count === 0
                                    ? "None yet"
                                    : reviews.data.toAnswer > 0
                                      ? `${reviews.data.toAnswer} waiting for a reply`
                                      : "All answered"
                                : reviews.status === "failed"
                                  ? "Couldn't load reviews"
                                  : "Your role can't see reviews"
                        }
                    />
                </Link>
            </div>

            <section className="flex flex-col gap-3">
                <SectionTitle
                    title="Linked to this product"
                    aside="Read-only here. Each has its own tab, and links on to where it is managed."
                />
                <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5">
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
                                <p className="text-[12px] text-muted-foreground">
                                    {reviews.data.toAnswer > 0
                                        ? `${plural(reviews.data.toAnswer, "review")} to answer`
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
                <ProductDetailsCard overview={overview} edit={edit} />

                <section className="flex min-w-0 flex-col gap-3">
                    <SectionTitle
                        title="Photos"
                        aside={`${product.images.length} of 5`}
                        action={
                            <Link
                                href={href("photos")}
                                className="text-[13px] font-medium underline-offset-4 hover:underline"
                            >
                                See all
                            </Link>
                        }
                    />
                    {product.images.length > 0 ? (
                        <div className="grid grid-cols-3 gap-1.5">
                            {product.images.slice(0, 5).map((img, i) => (
                                <div
                                    key={img.id}
                                    className={
                                        i === 0
                                            ? "relative col-span-2 row-span-2 overflow-hidden rounded-[10px] border border-border"
                                            : "overflow-hidden rounded-[10px] border border-border"
                                    }
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos, outside next/image's allowlist */}
                                    <img
                                        src={img.url}
                                        alt={img.alt}
                                        className="aspect-square size-full object-cover"
                                    />
                                    {i === 0 ? (
                                        <Badge
                                            variant="neutral"
                                            className="absolute left-2 top-2"
                                        >
                                            Cover
                                        </Badge>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Card className="grid place-items-center border-dashed px-4 py-10 text-center text-[13px] text-muted-foreground">
                            No photos yet — up to 5, the first is the cover.
                        </Card>
                    )}
                </section>
            </div>

            <section className="flex flex-col gap-3">
                <SectionTitle
                    title="Description"
                    action={
                        overview.canWrite ? (
                            <EditLink
                                href={edit("description")}
                                label="Edit description"
                            />
                        ) : null
                    }
                />
                <Card className="max-w-[70ch] px-5 py-4">
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
            </section>
        </div>
    );
}
