import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ArrowUpRight, Camera, ChevronLeft, Pencil } from "lucide-react";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import { productEditHref, productHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { priceLabel } from "@/lib/products/overview-rules";
import { whereItSells } from "@/lib/products/overview-words";

export const STATUS_BADGE = {
    PUBLISHED: { label: "Published", variant: "success" },
    DRAFT: { label: "Draft", variant: "draft" },
    ARCHIVED: { label: "Archived", variant: "neutral" },
} as const;

const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * The bar above the product (#522): back to Products and the product's
 * name; on the right, why the shop's page can't open yet, the Team /
 * Customer switch and "View on the shop".
 */
export function ProductCrumbs({
    overview,
    storeId,
    view,
}: {
    overview: ProductOverview;
    storeId: string;
    view: "team" | "customer";
}) {
    const { product } = overview;
    const live = product.status === "PUBLISHED";
    const note = live
        ? "The shop's product page arrives with the website."
        : product.status === "ARCHIVED"
          ? "Archived — its page does not open for customers."
          : "Publish it first — a draft has no public page.";
    return (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-[9px]">
            <Link
                href="/commerce/products"
                className={cn(
                    FOCUS,
                    "flex items-center gap-[7px] rounded-lg px-[9px] py-1.5 text-[12.5px] text-neutral-700 hover:bg-muted hover:text-foreground coarse:min-h-11 dark:text-muted-foreground",
                )}
            >
                <ChevronLeft
                    aria-hidden
                    className="size-[15px]"
                    strokeWidth={2}
                />
                Products
            </Link>
            <span aria-hidden className="text-[15px] text-muted-foreground">
                /
            </span>
            <span
                aria-current="page"
                className="min-w-0 truncate text-[13.5px] font-semibold"
            >
                {product.name}
            </span>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <span
                    id="shop-link-why"
                    role="status"
                    className="max-w-[300px] text-pretty text-[12px] text-muted-foreground max-sm:hidden"
                >
                    {note}
                </span>
                <div
                    role="group"
                    aria-label="View as"
                    className="flex rounded-lg bg-muted p-0.5"
                >
                    {(["team", "customer"] as const).map((v) => (
                        <Link
                            key={v}
                            href={`${productHref(storeId, product.id)}${v === "customer" ? "&view=customer" : ""}`}
                            scroll={false}
                            aria-current={view === v ? "page" : undefined}
                            className={cn(
                                FOCUS,
                                "flex items-center rounded-md px-2.5 py-1 text-[12px] font-semibold coarse:min-h-11",
                                view === v
                                    ? "bg-card text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {v === "team" ? "Team" : "Customer"} view
                        </Link>
                    ))}
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    disabled
                    aria-describedby="shop-link-why"
                    className="h-7 gap-1.5 rounded-[7px] px-2 text-[12.5px] font-medium coarse:h-11"
                >
                    {live
                        ? "View on the shop"
                        : product.status === "ARCHIVED"
                          ? "Not on the shop"
                          : "Not on the shop yet"}
                    <ArrowUpRight
                        aria-hidden
                        className="size-3"
                        strokeWidth={2}
                    />
                </Button>
            </div>
        </div>
    );
}

/**
 * Who this product is at a glance (#522): its cover — which opens Photos —
 * its name and saved status, then one line: what it sells for, its
 * category, where it sells and when it last changed. "Edit product" opens
 * the whole editor; each panel below has its own Edit.
 */
export function ProductHeader({
    overview,
    storeId,
    photosHref,
}: {
    overview: ProductOverview;
    storeId: string;
    photosHref: string;
}) {
    const { product, price } = overview;
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency) ?? amount;
    const status = STATUS_BADGE[product.status];
    // The cover is the first photo; a video never stands in for it.
    const cover = product.images.find((i) => i.kind !== "video");
    const where = whereItSells(
        product.status,
        (product.storefronts ?? []).map((s) => s.name),
    );
    const meta = [
        priceLabel(price, money),
        product.category?.name ?? "no category",
        where,
    ].join(" · ");

    return (
        <div className="flex flex-wrap items-center gap-3.5 border-b border-border px-4 pb-4 pt-5 sm:px-[22px]">
            {cover ? (
                <Link
                    href={photosHref}
                    scroll={false}
                    aria-label="Cover photo — open Photos"
                    className={cn(
                        FOCUS,
                        "size-14 shrink-0 overflow-hidden rounded-xl bg-muted",
                    )}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos, outside next/image's allowlist */}
                    <img
                        src={cover.url}
                        alt=""
                        className="size-full object-cover"
                    />
                </Link>
            ) : (
                <Link
                    href={photosHref}
                    scroll={false}
                    aria-label="Add a photo"
                    className={cn(
                        FOCUS,
                        "flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-border-strong bg-muted/60 text-[10.5px] font-semibold text-muted-foreground hover:bg-muted",
                    )}
                >
                    <Camera
                        aria-hidden
                        className="size-[18px]"
                        strokeWidth={1.8}
                    />
                    Add
                </Link>
            )}
            <div className="min-w-0 flex-[1_1_260px]">
                <div className="flex flex-wrap items-center gap-[9px]">
                    <h1 className="min-w-0 break-words font-display text-[24px] font-semibold leading-[1.15] tracking-[-0.025em]">
                        {product.name}
                    </h1>
                    <Badge
                        variant={status.variant}
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
                    >
                        {status.label}
                    </Badge>
                </div>
                <p className="mt-1 text-pretty text-[13px] tabular-nums text-muted-foreground">
                    {meta} · Changed{" "}
                    <ViewerDate iso={overview.lastChanged} variant="dayMonth" />
                </p>
            </div>
            {overview.canWrite ? (
                <Button
                    asChild
                    className="gap-[7px] rounded-[9px] px-4 text-[12.5px]"
                >
                    <Link href={productEditHref(storeId, product.id)}>
                        <Pencil
                            aria-hidden
                            className="size-3.5"
                            strokeWidth={1.9}
                        />
                        Edit product
                    </Link>
                </Button>
            ) : null}
        </div>
    );
}

/** For anyone who can't change the product: what they can do, and who can. */
export function AccessLine({ line }: { line: string }) {
    return (
        <p
            role="note"
            className="text-pretty border-b border-border bg-muted px-4 py-2.5 text-[12.5px] leading-[1.5] text-neutral-700 dark:text-muted-foreground sm:px-[22px]"
        >
            {line}
        </p>
    );
}
