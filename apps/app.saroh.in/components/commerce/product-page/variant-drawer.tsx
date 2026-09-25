"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import Link from "next/link";
import type { ReactNode } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import { orderHref } from "@/lib/orders/links";
import { productEditHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview-rules";
import {
    customersSee,
    ORDER_STATUS_LABEL,
} from "@/lib/products/overview-rules";

export const WORD_BADGE = {
    IN_STOCK: "success",
    LOW: "warning",
    SOLD_OUT: "error",
} as const;

/**
 * One variant's own page, over the product page: its price and photo, its
 * stock, the open orders holding it, and what the people who bought it said.
 */
export function VariantDrawer({
    overview,
    storeId,
    variantId,
    onClose,
}: {
    overview: ProductOverview;
    storeId: string;
    variantId: string | null;
    onClose: () => void;
}) {
    const { product, stock } = overview;
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency) ?? amount;
    const edit = (section: "variants" | "stock") =>
        productEditHref(storeId, product.id, section);
    const open = product.variants.find((v) => v.id === variantId) ?? null;
    const openLine = open
        ? (stock.variants.find((l) => l.variantId === open.id) ?? null)
        : null;
    const orders =
        overview.orders.status === "ok" ? overview.orders.data : null;
    const reviews =
        overview.reviews.status === "ok" ? overview.reviews.data : null;

    const photo = open
        ? (product.images.find((i) => i.id === open.imageId) ??
          product.images.find((i) => i.kind !== "video"))
        : undefined;
    const mineOrders =
        open && orders
            ? orders.recent.filter(
                  (o) => o.open && o.lines.some((l) => l.variantId === open.id),
              )
            : [];
    const mineReviews =
        open && reviews
            ? reviews.latest.filter((r) => r.variantId === open.id)
            : [];

    return (
        <Sheet open={open !== null} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[420px]">
                {open ? (
                    <>
                        <SheetHeader className="sticky top-0 z-[1] flex-row items-center gap-2.5 space-y-0 border-b border-border bg-card py-3.5 pl-[18px] pr-14 text-left">
                            <div className="min-w-0 flex-1">
                                <p className="text-[11.5px] text-muted-foreground">
                                    {product.name}
                                </p>
                                <SheetTitle className="font-display text-[18px] tracking-[-0.02em]">
                                    {open.title}
                                </SheetTitle>
                                <SheetDescription className="sr-only">
                                    Stock, open orders and reviews for this
                                    variant.
                                </SheetDescription>
                            </div>
                            {overview.canWrite ? (
                                <Button
                                    asChild
                                    variant="outline"
                                    className="h-[30px] rounded-[8px] px-[11px] text-[12px] coarse:h-11"
                                >
                                    <Link href={edit("variants")}>Edit</Link>
                                </Button>
                            ) : null}
                        </SheetHeader>
                        <div className="flex flex-col gap-5 px-[18px] pb-[22px] pt-4 text-[13px]">
                            <div>
                                <div className="flex items-start gap-3">
                                    {photo ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos
                                        <img
                                            src={photo.url}
                                            alt={photo.alt}
                                            className="h-[72px] w-24 shrink-0 rounded-[9px] object-cover"
                                        />
                                    ) : null}
                                    <div className="min-w-0">
                                        <p className="font-display text-[20px] font-semibold tabular-nums">
                                            {money(open.price ?? product.price)}
                                        </p>
                                        <p className="text-[12px] text-muted-foreground">
                                            {open.price === null ||
                                            open.price === product.price
                                                ? "The product's price"
                                                : `Its own price — the product's is ${money(product.price)}`}
                                        </p>
                                        <p className="mt-1 font-mono text-[11.5px] text-muted-foreground">
                                            SKU {open.sku}
                                        </p>
                                    </div>
                                </div>
                                <p className="mt-2 text-[11.5px] text-muted-foreground">
                                    {open.imageId
                                        ? "Shows its own photo when someone picks it."
                                        : "Shows the cover when someone picks it."}
                                </p>
                            </div>

                            <DrawerSection title="Stock">
                                {openLine ? (
                                    <>
                                        <div className="grid grid-cols-4 gap-2">
                                            <Tile
                                                label="On hand"
                                                value={openLine.onHand}
                                            />
                                            <Tile
                                                label="Promised"
                                                value={openLine.promised}
                                            />
                                            <Tile
                                                label="Can sell"
                                                value={openLine.canSell}
                                            />
                                            <Tile
                                                label="Warn at"
                                                value={openLine.warnAt}
                                            />
                                        </div>
                                        <Badge
                                            variant={WORD_BADGE[openLine.word]}
                                            className="mt-2.5 rounded-full px-2 text-[11.5px] font-semibold"
                                        >
                                            Customers see:{" "}
                                            {customersSee(openLine)}
                                        </Badge>
                                    </>
                                ) : (
                                    <p className="text-muted-foreground">
                                        Counted with the product as a whole.
                                    </p>
                                )}
                            </DrawerSection>

                            <DrawerSection title="Open orders">
                                {orders ? (
                                    <>
                                        {mineOrders.length === 0 ? (
                                            <p className="text-[12.5px] text-muted-foreground">
                                                No open orders for this size.
                                            </p>
                                        ) : (
                                            <ul>
                                                {mineOrders.map((o) => (
                                                    <li
                                                        key={o.id}
                                                        className="flex items-center gap-2.5 border-b border-foreground/10 py-2 last:border-0"
                                                    >
                                                        <Link
                                                            href={orderHref(
                                                                storeId,
                                                                o.id,
                                                            )}
                                                            className="font-mono text-[12px] text-brand hover:text-foreground"
                                                        >
                                                            {o.orderNumber}
                                                        </Link>
                                                        <span className="min-w-0 flex-1 truncate">
                                                            {o.customer} · ×{" "}
                                                            {o.lines
                                                                .filter(
                                                                    (l) =>
                                                                        l.variantId ===
                                                                        open.id,
                                                                )
                                                                .reduce(
                                                                    (n, l) =>
                                                                        n +
                                                                        l.quantity,
                                                                    0,
                                                                )}
                                                        </span>
                                                        <Badge
                                                            variant={
                                                                o.status ===
                                                                "PROCESSING"
                                                                    ? "success"
                                                                    : "draft"
                                                            }
                                                            className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-[1.3]"
                                                        >
                                                            {ORDER_STATUS_LABEL[
                                                                o.status
                                                            ] ?? o.status}
                                                        </Badge>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        <p className="mt-2 text-[12.5px] text-muted-foreground">
                                            {orders.soldThisMonth[open.id] ?? 0}{" "}
                                            sold this month.
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-[12.5px] text-muted-foreground">
                                        {overview.orders.status === "failed"
                                            ? "Couldn't load orders. Stock figures above are still right."
                                            : "Your role can't see orders."}
                                    </p>
                                )}
                            </DrawerSection>

                            <DrawerSection title="Reviews from people who bought it">
                                {reviews ? (
                                    mineReviews.length === 0 ? (
                                        <p className="text-[12.5px] text-muted-foreground">
                                            No reviews from people who bought
                                            this size yet.
                                        </p>
                                    ) : (
                                        <ul className="flex flex-col gap-2">
                                            {mineReviews.map((r) => (
                                                <li
                                                    key={r.id}
                                                    className="rounded-[9px] bg-muted px-[11px] py-[9px]"
                                                >
                                                    <p className="flex flex-wrap items-center gap-1.5 text-[12px]">
                                                        <span
                                                            role="img"
                                                            aria-label={`${r.rating} out of 5`}
                                                            className="tracking-[1px] text-highlight"
                                                        >
                                                            {"★".repeat(
                                                                r.rating,
                                                            )}
                                                        </span>
                                                        <span className="font-semibold">
                                                            {r.displayName}
                                                        </span>
                                                        <span className="text-muted-foreground">
                                                            ·{" "}
                                                            <ViewerDate
                                                                iso={
                                                                    r.createdAt
                                                                }
                                                            />
                                                        </span>
                                                    </p>
                                                    {r.body ? (
                                                        <p className="mt-[3px] text-[12.5px] leading-[1.5]">
                                                            {r.body}
                                                        </p>
                                                    ) : null}
                                                </li>
                                            ))}
                                        </ul>
                                    )
                                ) : (
                                    <p className="text-[12.5px] text-muted-foreground">
                                        {overview.reviews.status === "failed"
                                            ? "Couldn't load reviews."
                                            : "Your role can't see reviews."}
                                    </p>
                                )}
                            </DrawerSection>
                        </div>
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

export function Tile({
    label,
    value,
}: {
    label: string;
    value: number | string;
}) {
    return (
        <div className="rounded-[9px] bg-muted px-2.5 py-[9px]">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="mt-0.5 font-display text-[17px] font-semibold tabular-nums">
                {value}
            </p>
        </div>
    );
}

function DrawerSection({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {title}
            </h3>
            {children}
        </section>
    );
}
