"use client";

import { Badge } from "@saroh/ui/badge";
import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import { Box, ChevronRight } from "lucide-react";
import { useState } from "react";

import { formatMoneyMajor } from "@/lib/format/money";
import { productEditHref } from "@/lib/products/links";
import type { ProductOverview, StockLine } from "@/lib/products/overview-rules";
import { customersSee } from "@/lib/products/overview-rules";
import type { ProductTracking } from "@/lib/products/tracking";
import { TRACKING_LOCKED } from "@/lib/products/tracking";

import { StateLink, TabState } from "./panel-state";
import { SheetButton } from "./sheet-button";
import { StopTrackingButton } from "./tracking-actions";
import { Tile, VariantDrawer, WORD_BADGE } from "./variant-drawer";

/**
 * Every variant with its price and stock, and the whole product beneath.
 * "Can sell" is on hand minus what is promised to open orders — the number
 * the shop uses. A row opens that variant's own page in a drawer: its stock,
 * the open orders holding it, what its buyers said, and its photo.
 */
export function ProductVariantsTab({
    overview,
    storeId,
    tracking,
}: {
    overview: ProductOverview;
    storeId: string;
    tracking: ProductTracking;
}) {
    const { product } = overview;
    const counts = tracking.counts;
    // Untracked (#515): no count anywhere, so never a number or "Sold out".
    const stock = counts
        ? overview.stock
        : { ...overview.stock, variants: [], product: null };
    const stop =
        counts && tracking.control === "change" ? (
            <StopTrackingButton
                productId={product.id}
                productName={product.name}
                storeId={storeId}
            />
        ) : null;
    const [openId, setOpenId] = useState<string | null>(null);
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency) ?? amount;
    const lineOf = (variantId: string): StockLine | null =>
        stock.variants.find((l) => l.variantId === variantId) ?? null;
    const edit = (section: "variants" | "stock") =>
        productEditHref(storeId, product.id, section);

    if (product.variants.length === 0) {
        return (
            <div className="flex flex-col gap-4">
                {stock.product ? <StockSummary line={stock.product} /> : null}
                <TabState
                    icon={Box}
                    title="Sold as itself"
                    description={`No sizes or shades, so every order is for "${product.name}" at ${money(product.price)}.${
                        !counts
                            ? " Stock isn't tracked, so it is always available on the shop."
                            : stock.product
                              ? ""
                              : " There is no stock count yet either."
                    }`}
                >
                    {overview.canWrite ? (
                        <>
                            <StateLink href={edit("variants")}>
                                Add variants
                            </StateLink>
                            {stock.product || !counts ? null : (
                                <StateLink href={edit("stock")}>
                                    Add stock
                                </StateLink>
                            )}
                        </>
                    ) : null}
                </TabState>
                {stop ? (
                    <div className="flex justify-center">{stop}</div>
                ) : null}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            <Card className="rounded-[12px] bg-card p-0">
                <div className="overflow-x-auto px-[18px] pt-1.5">
                    <table
                        className={cn(
                            "w-full table-fixed text-[13px]",
                            counts ? "min-w-[640px]" : "min-w-[360px]",
                        )}
                    >
                        {counts ? (
                            <colgroup>
                                <col className="w-[26%]" />
                                <col className="w-[16%]" />
                                <col className="w-20" />
                                <col className="w-20" />
                                <col className="w-20" />
                                <col className="w-20" />
                                <col />
                            </colgroup>
                        ) : (
                            <colgroup>
                                <col className="w-[45%]" />
                                <col className="w-[30%]" />
                                <col />
                            </colgroup>
                        )}
                        <caption className="sr-only">
                            Variants of {product.name} with price
                            {counts ? " and stock" : ""}
                        </caption>
                        <thead>
                            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                                <th
                                    scope="col"
                                    className="px-1.5 pb-[7px] pt-2.5 font-semibold"
                                >
                                    {product.option?.name ?? "Variant"}
                                </th>
                                <th
                                    scope="col"
                                    className="px-1.5 pb-[7px] pt-2.5 font-semibold"
                                >
                                    SKU
                                </th>
                                <th
                                    scope="col"
                                    className="px-1.5 pb-[7px] pt-2.5 text-right font-semibold"
                                >
                                    Price
                                </th>
                                {counts ? (
                                    <>
                                        <th
                                            scope="col"
                                            className="px-1.5 pb-[7px] pt-2.5 text-right font-semibold"
                                        >
                                            On hand
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-1.5 pb-[7px] pt-2.5 text-right font-semibold"
                                        >
                                            Promised
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-1.5 pb-[7px] pt-2.5 text-right font-semibold"
                                        >
                                            Can sell
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-1.5 pb-[7px] pt-2.5 font-semibold"
                                        >
                                            Customers see
                                        </th>
                                    </>
                                ) : null}
                            </tr>
                        </thead>
                        <tbody>
                            {product.variants.map((v) => {
                                const line = lineOf(v.id);
                                return (
                                    <tr
                                        key={v.id}
                                        // The whole row opens the variant; the
                                        // button inside is the keyboard's way in.
                                        onClick={() => setOpenId(v.id)}
                                        className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/50"
                                    >
                                        <td className="px-1.5 py-[11px]">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenId(v.id);
                                                }}
                                                aria-label={`Open ${v.title} details`}
                                                className="flex items-center gap-1 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                                            >
                                                {v.title}
                                                <ChevronRight
                                                    aria-hidden
                                                    strokeWidth={2.2}
                                                    className="size-3 text-muted-foreground"
                                                />
                                            </button>
                                        </td>
                                        <td className="truncate px-1.5 py-[11px] font-mono text-[11.5px] text-muted-foreground">
                                            {v.sku}
                                        </td>
                                        <td className="px-1.5 py-[11px] text-right tabular-nums">
                                            {money(v.price ?? product.price)}
                                            {v.price === null ? (
                                                <span className="sr-only">
                                                    {" "}
                                                    (the product&apos;s price)
                                                </span>
                                            ) : null}
                                        </td>
                                        {counts ? (
                                            <>
                                                <Num value={line?.onHand} />
                                                <Num value={line?.promised} />
                                                <Num
                                                    value={line?.canSell}
                                                    strong
                                                />
                                                <td className="px-1.5 py-[11px]">
                                                    {line ? (
                                                        <Badge
                                                            variant={
                                                                WORD_BADGE[
                                                                    line.word
                                                                ]
                                                            }
                                                            className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-[1.3]"
                                                        >
                                                            {customersSee(line)}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            Counted with the
                                                            product
                                                        </span>
                                                    )}
                                                </td>
                                            </>
                                        ) : null}
                                    </tr>
                                );
                            })}
                            {counts ? (
                                <tr className="border-t border-border text-[12.5px] text-muted-foreground">
                                    <td
                                        className="px-1.5 pb-0 pt-[11px]"
                                        colSpan={3}
                                    >
                                        Whole product
                                    </td>
                                    <Num value={stock.totals.onHand} muted />
                                    <Num value={stock.totals.promised} muted />
                                    <Num value={stock.totals.canSell} strong />
                                    <td />
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
                <div className="flex flex-wrap items-center gap-3 px-[18px] pb-3.5 pt-3">
                    {overview.canWrite ? (
                        <SheetButton
                            kind="stock"
                            label={
                                counts ? "Edit prices and stock" : "Edit prices"
                            }
                            product={product}
                            storeId={storeId}
                            counts={counts}
                        />
                    ) : null}
                    <p className="min-w-0 flex-[1_1_240px] text-[11.5px] text-muted-foreground">
                        {!counts
                            ? "Stock isn't tracked, so every variant is always available on the shop. Open a variant for its orders, reviews and photo."
                            : stock.mode === "product"
                              ? "Stock is counted for the product as a whole. Count each variant on its own in the editor's Stock section."
                              : "Can sell is on hand minus what is promised to orders — the number the shop uses. Open a variant for its orders, reviews and photo."}
                    </p>
                    {stop}
                    {counts && tracking.control === "locked" ? (
                        <p className="text-[11.5px] text-muted-foreground">
                            {TRACKING_LOCKED}
                        </p>
                    ) : null}
                </div>
            </Card>

            <VariantDrawer
                overview={overview}
                storeId={storeId}
                variantId={openId}
                onClose={() => setOpenId(null)}
                counts={counts}
            />
        </div>
    );
}

function StockSummary({ line }: { line: StockLine }) {
    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="On hand" value={line.onHand} />
            <Tile label="Promised" value={line.promised} />
            <Tile label="Can sell" value={line.canSell} />
            <Tile label="Customers see" value={customersSee(line)} />
        </div>
    );
}

function Num({
    value,
    strong,
    muted,
}: {
    value: number | undefined;
    strong?: boolean;
    muted?: boolean;
}) {
    return (
        <td
            className={cn(
                "px-1.5 py-[11px] text-right tabular-nums",
                strong && "font-semibold text-foreground",
                muted && "font-normal",
            )}
        >
            {value ?? "—"}
        </td>
    );
}
