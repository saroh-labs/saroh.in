import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ArrowUpRight, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import Link from "next/link";

import { sellCrumbs } from "@/components/commerce/sell-crumbs";
import { formatMoneyMajor } from "@/lib/format/money";
import { productEditHref, productHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { priceLabel } from "@/lib/products/overview-rules";

export const STATUS_BADGE = {
    PUBLISHED: { label: "Published", variant: "success" },
    DRAFT: { label: "Draft", variant: "draft" },
    ARCHIVED: { label: "Archived", variant: "neutral" },
} as const;

/**
 * Who this product is at a glance: its cover, name and saved status, then
 * one line — what it sells for, how many can be sold, where it sits and
 * where it is sold. "Edit product" opens the whole editor; each panel below
 * links to its own section.
 */
export function ProductHeader({
    overview,
    storeId,
    view,
}: {
    overview: ProductOverview;
    storeId: string;
    view: "team" | "customer";
}) {
    const { product, stock, price, storefront } = overview;
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency) ?? amount;
    const status = STATUS_BADGE[product.status];
    const cover = product.images.at(0);
    const tracked = stock.mode === "variant" || stock.product !== null;

    const meta = [
        priceLabel(price, money),
        tracked ? `${stock.totals.canSell} can be sold` : "no stock count",
        product.category?.name ?? "no category",
        product.status === "PUBLISHED"
            ? storefront.name
            : product.status === "ARCHIVED"
              ? "not on the shop"
              : "not on the shop yet",
    ];

    const crumbs = sellCrumbs(
        { label: "Products", href: "/commerce/products" },
        product.name,
    );

    const live = product.status === "PUBLISHED";
    return (
        <div className="flex flex-col gap-3">
            {/*
             * On a phone the trail is one step back, as the design's phone
             * bar draws it — the full crumbs, the shop's note and a button
             * that cannot be pressed yet would take three lines above the
             * product's own name (2026-09-25).
             */}
            <Link
                href="/commerce/products"
                className="-ml-1 flex w-fit items-center gap-1 rounded-md px-1 py-1 text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11 sm:hidden"
            >
                <ChevronLeft aria-hidden className="size-4" />
                Products
            </Link>
            <div className="hidden flex-wrap items-center gap-x-3 gap-y-2 sm:flex">
                <nav
                    aria-label="Breadcrumb"
                    // A basis, so on a phone the crumbs take their own row rather
                    // than squeezing under the note beside them.
                    className="flex min-w-0 flex-[1_1_240px] flex-wrap items-center gap-2 text-[12px] text-muted-foreground"
                >
                    {crumbs.map((crumb, i) => (
                        <span key={i} className="flex items-center gap-2">
                            {i > 0 ? (
                                <ChevronRight aria-hidden className="size-3" />
                            ) : null}
                            <span
                                className={cn(
                                    i === crumbs.length - 1 &&
                                        "text-foreground",
                                )}
                            >
                                {crumb}
                            </span>
                        </span>
                    ))}
                </nav>
                <span
                    id="shop-link-why"
                    className="min-w-0 max-w-[300px] text-pretty text-[12px] text-muted-foreground"
                >
                    {live
                        ? "The shop's product page arrives with the website."
                        : product.status === "ARCHIVED"
                          ? "Archived — its page does not open for customers."
                          : "Publish it first — a draft has no public page."}
                </span>
                <Button
                    type="button"
                    variant="outline"
                    disabled
                    aria-describedby="shop-link-why"
                    className="h-8 gap-[7px] rounded-[9px] px-3 text-[12.5px] coarse:h-11"
                >
                    {live
                        ? "View on the shop"
                        : product.status === "ARCHIVED"
                          ? "Not on the shop"
                          : "Not on the shop yet"}
                    <ArrowUpRight
                        className="size-[13px]"
                        strokeWidth={2}
                        aria-hidden
                    />
                </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border pb-4">
                <div className="size-12 shrink-0 overflow-hidden rounded-[10px] bg-muted sm:size-14">
                    {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos, outside next/image's allowlist
                        <img
                            src={cover.url}
                            alt=""
                            className="size-full object-cover"
                        />
                    ) : product.status === "DRAFT" ? (
                        <div
                            aria-hidden
                            className="size-full rounded-[10px] border-[1.5px] border-dashed border-border-strong"
                        />
                    ) : null}
                </div>
                <div className="min-w-0 flex-[1_1_200px]">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <h1 className="min-w-0 break-words font-display text-[20px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[24px]">
                            {product.name}
                        </h1>
                        <Badge
                            variant={status.variant}
                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
                        >
                            {status.label}
                        </Badge>
                    </div>
                    <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">
                        {meta.join(" · ")}
                    </p>
                </div>
                <div className="flex w-full flex-wrap items-center justify-between gap-2.5 sm:w-auto sm:justify-start">
                    <nav
                        aria-label="View as"
                        className="inline-flex rounded-[10px] bg-muted p-[3px]"
                    >
                        {(["team", "customer"] as const).map((v) => (
                            <Link
                                key={v}
                                href={`${productHref(storeId, product.id)}${v === "customer" ? "&view=customer" : ""}`}
                                scroll={false}
                                aria-current={view === v ? "page" : undefined}
                                className={cn(
                                    "rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11 coarse:py-2.5",
                                    view === v
                                        ? "bg-card text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {v === "team" ? "Team" : "Customer"}
                                <span className="max-sm:sr-only"> view</span>
                            </Link>
                        ))}
                    </nav>
                    {overview.canWrite ? (
                        <Button
                            asChild
                            className="h-[34px] gap-[7px] rounded-[9px] px-3.5 text-[12.5px] coarse:h-11"
                        >
                            <Link href={productEditHref(storeId, product.id)}>
                                <Pencil
                                    className="size-3.5"
                                    strokeWidth={1.9}
                                    aria-hidden
                                />
                                Edit
                                {/* The button spaces its parts itself. */}
                                <span className="max-sm:sr-only">product</span>
                            </Link>
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
