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
import { Pencil } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

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

    return (
        <Sheet open={open !== null} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-[420px]">
                {open ? (
                    <>
                        <SheetHeader>
                            <p className="text-[11.5px] text-muted-foreground">
                                {product.name}
                            </p>
                            <SheetTitle>{open.title}</SheetTitle>
                            <SheetDescription className="font-mono text-[12px]">
                                SKU {open.sku}
                            </SheetDescription>
                        </SheetHeader>
                        <div className="mt-4 flex flex-col gap-5 text-[13px]">
                            <div className="flex items-start gap-3">
                                {(() => {
                                    const photo =
                                        product.images.find(
                                            (i) => i.id === open.imageId,
                                        ) ?? product.images.at(0);
                                    return photo ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos
                                        <img
                                            src={photo.url}
                                            alt={photo.alt}
                                            className="h-[72px] w-24 shrink-0 rounded-md border border-border object-cover"
                                        />
                                    ) : null;
                                })()}
                                <div>
                                    <p className="font-display text-[20px] font-semibold tabular-nums">
                                        {money(open.price ?? product.price)}
                                    </p>
                                    <p className="text-muted-foreground">
                                        {open.price === null ||
                                        open.price === product.price
                                            ? "The product's price"
                                            : `Its own price — the product's is ${money(product.price)}`}
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                        {open.imageId
                                            ? "Shows its own photo when someone picks it."
                                            : "Shows the cover when someone picks it."}
                                    </p>
                                </div>
                            </div>

                            <DrawerSection title="Stock">
                                {openLine ? (
                                    <>
                                        <div className="grid grid-cols-2 gap-2">
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
                                        <p className="mt-2">
                                            Customers see:{" "}
                                            <Badge
                                                variant={
                                                    WORD_BADGE[openLine.word]
                                                }
                                            >
                                                {customersSee(openLine)}
                                            </Badge>
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-muted-foreground">
                                        Counted with the product as a whole.
                                    </p>
                                )}
                            </DrawerSection>

                            <DrawerSection title="Open orders">
                                {orders ? (
                                    (() => {
                                        const mine = orders.recent.filter(
                                            (o) =>
                                                o.open &&
                                                o.lines.some(
                                                    (l) =>
                                                        l.variantId === open.id,
                                                ),
                                        );
                                        const sold =
                                            orders.soldThisMonth[open.id] ?? 0;
                                        return (
                                            <>
                                                {mine.length === 0 ? (
                                                    <p className="text-muted-foreground">
                                                        None open.
                                                    </p>
                                                ) : (
                                                    <ul className="flex flex-col gap-1.5">
                                                        {mine.map((o) => (
                                                            <li
                                                                key={o.id}
                                                                className="flex flex-wrap items-center gap-2"
                                                            >
                                                                <Link
                                                                    href={orderHref(
                                                                        storeId,
                                                                        o.id,
                                                                    )}
                                                                    className="font-mono text-[12px] underline-offset-4 hover:underline"
                                                                >
                                                                    {
                                                                        o.orderNumber
                                                                    }
                                                                </Link>
                                                                <span>
                                                                    {o.customer}{" "}
                                                                    · ×{" "}
                                                                    {o.lines
                                                                        .filter(
                                                                            (
                                                                                l,
                                                                            ) =>
                                                                                l.variantId ===
                                                                                open.id,
                                                                        )
                                                                        .reduce(
                                                                            (
                                                                                n,
                                                                                l,
                                                                            ) =>
                                                                                n +
                                                                                l.quantity,
                                                                            0,
                                                                        )}
                                                                </span>
                                                                <Badge variant="draft">
                                                                    {ORDER_STATUS_LABEL[
                                                                        o.status
                                                                    ] ??
                                                                        o.status}
                                                                </Badge>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                                <p className="mt-2 text-muted-foreground">
                                                    {sold} sold this month.
                                                </p>
                                            </>
                                        );
                                    })()
                                ) : (
                                    <p className="text-muted-foreground">
                                        {overview.orders.status === "failed"
                                            ? "Couldn't load orders."
                                            : "Your role can't see orders."}
                                    </p>
                                )}
                            </DrawerSection>

                            <DrawerSection title="Reviews from people who bought it">
                                {reviews ? (
                                    (() => {
                                        const mine = reviews.latest.filter(
                                            (r) => r.variantId === open.id,
                                        );
                                        return mine.length === 0 ? (
                                            <p className="text-muted-foreground">
                                                None yet.
                                            </p>
                                        ) : (
                                            <ul className="flex flex-col gap-2">
                                                {mine.map((r) => (
                                                    <li
                                                        key={r.id}
                                                        className="rounded-md border border-border px-3 py-2"
                                                    >
                                                        <p>
                                                            <span
                                                                aria-label={`${r.rating} out of 5`}
                                                            >
                                                                {"★".repeat(
                                                                    r.rating,
                                                                )}
                                                            </span>{" "}
                                                            <span className="font-medium">
                                                                {r.displayName}
                                                            </span>
                                                        </p>
                                                        {r.body ? (
                                                            <p className="mt-1">
                                                                {r.body}
                                                            </p>
                                                        ) : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        );
                                    })()
                                ) : (
                                    <p className="text-muted-foreground">
                                        {overview.reviews.status === "failed"
                                            ? "Couldn't load reviews."
                                            : "Your role can't see reviews."}
                                    </p>
                                )}
                            </DrawerSection>

                            {overview.canWrite ? (
                                <Button asChild variant="outline">
                                    <Link href={edit("variants")}>
                                        <Pencil aria-hidden />
                                        Edit in the full editor
                                    </Link>
                                </Button>
                            ) : null}
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
        <div className="rounded-md bg-muted px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="font-display text-[17px] font-semibold tabular-nums">
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
