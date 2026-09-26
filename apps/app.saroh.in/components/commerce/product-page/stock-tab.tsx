"use client";

import { Card } from "@saroh/ui/card";
import { Box } from "lucide-react";
import { useState } from "react";

import { formatMoneyMajor } from "@/lib/format/money";
import { productEditHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview-rules";
import type { ProductTracking } from "@/lib/products/tracking";
import { TRACKING_LOCKED, untrackedShort } from "@/lib/products/tracking";
import type { ProductStock } from "@/lib/stock/product-stock";
import { stockFootnote } from "@/lib/stock/product-stock";
import type { StockCheck, StockLogEntry } from "@/lib/stock/service";

import { PanelFailed, StateLink, TabState } from "./panel-state";
import { StockSheetButton } from "./sheets/stock-sheet";
import { LastChange, ProductChecks, RecentChanges } from "./stock-recent";
import { StockTable } from "./stock-table";
import { StopTrackingButton } from "./tracking-actions";
import { VariantDrawer } from "./variant-drawer";

/**
 * The product's Stock tab (#523), after the design: "Sizes and stock" per
 * storefront, with Stop tracking (asked first, Owner and Admin only) and
 * the stock sheet — count and move for anyone who may count stock, prices
 * too for anyone who may change the product. Then any stock checks about
 * it, and its recent changes. A row opens that size's own page.
 *
 * Untracked (#515), there is no count: the sizes and their prices only.
 */
export function ProductStockTab({
    overview,
    storeId,
    tracking,
    stock,
    log,
    week,
    checks,
    retryHref,
    ordersHref,
    now,
}: {
    overview: ProductOverview;
    storeId: string;
    tracking: ProductTracking;
    /** Its shelves at every storefront; null when the read failed. */
    stock: ProductStock | null;
    log: StockLogEntry[] | null;
    week: StockLogEntry[] | null;
    checks: StockCheck[];
    retryHref: string;
    ordersHref: string;
    now: Date;
}) {
    const { product } = overview;
    const [openId, setOpenId] = useState<string | null>(null);
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency) ?? amount;
    const counts = tracking.counts;
    const counted =
        overview.stock.mode === "variant" || overview.stock.product !== null;

    const drawer = (
        <VariantDrawer
            overview={overview}
            storeId={storeId}
            variantId={openId}
            onClose={() => setOpenId(null)}
            counts={counts}
        />
    );

    if (!counts) {
        return (
            <div className="flex flex-col gap-3">
                <TabState
                    icon={Box}
                    title="Not tracked"
                    description={`${untrackedShort(product.storefronts ?? [])} ${
                        product.variants.length
                            ? `Sold in ${product.variants.length} sizes: ${product.variants
                                  .map(
                                      (v) =>
                                          `${v.title} ${money(v.price ?? product.price)}`,
                                  )
                                  .join(", ")}.`
                            : `Sold as itself at ${money(product.price)}.`
                    }`}
                >
                    {overview.canWrite ? (
                        <StockSheetButton
                            overview={overview}
                            storeId={storeId}
                            stock={null}
                            counts={false}
                            label="Change prices"
                        />
                    ) : null}
                </TabState>
                {product.variants.length > 0 ? (
                    <Card className="rounded-[12px] p-0">
                        <ul
                            aria-label="Sizes and prices"
                            className="px-[18px] py-1"
                        >
                            {product.variants.map((v) => (
                                <li
                                    key={v.id}
                                    className="flex items-center justify-between gap-3 border-t border-border py-2.5 text-[13px] first:border-t-0"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setOpenId(v.id)}
                                        aria-label={`Open ${v.title} details`}
                                        className="flex min-w-0 items-center gap-1.5 rounded-sm text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                                    >
                                        {v.title}
                                        <span className="font-mono text-[11px] font-normal text-muted-foreground">
                                            {v.sku}
                                        </span>
                                    </button>
                                    <span className="tabular-nums">
                                        {money(v.price ?? product.price)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                ) : null}
                {drawer}
            </div>
        );
    }

    if (!stock) {
        return (
            <PanelFailed
                what="stock"
                retryHref={retryHref}
                note="The rest of the product loaded; only its stock by storefront did not. Nothing about the stock has changed."
            />
        );
    }

    if (!counted) {
        return (
            <TabState
                icon={Box}
                title="No stock count yet"
                description={
                    product.variants.length
                        ? `Each of the ${product.variants.length} sizes gets its own count, so a small one can run out before a large one.`
                        : "Add a count to see how many you have and get a warning when it runs low."
                }
            >
                {overview.canStock ? (
                    <StockSheetButton
                        overview={overview}
                        storeId={storeId}
                        stock={stock}
                        counts
                        label="Add stock"
                    />
                ) : (
                    <StateLink
                        href={productEditHref(storeId, product.id, "stock")}
                    >
                        Open the Stock section
                    </StateLink>
                )}
            </TabState>
        );
    }

    return (
        <div className="flex flex-col">
            <Card className="rounded-[12px] p-0">
                <div className="flex flex-wrap items-center gap-2 px-[18px] pb-1 pt-3.5">
                    <h2 className="font-display text-[15px] font-semibold tracking-[-0.015em]">
                        Sizes and stock
                    </h2>
                    <span className="min-w-0 flex-[1_1_200px] text-[12px] text-muted-foreground">
                        {log?.at(0) ? <LastChange entry={log[0]} /> : null}
                    </span>
                    {tracking.control === "change" ? (
                        <StopTrackingButton
                            productId={product.id}
                            productName={product.name}
                            storeId={storeId}
                        />
                    ) : null}
                    {overview.canStock ? (
                        <StockSheetButton
                            overview={overview}
                            storeId={storeId}
                            stock={stock}
                            counts
                            label={
                                overview.canWrite
                                    ? "Change stock or prices"
                                    : "Change stock"
                            }
                        />
                    ) : null}
                </div>
                <StockTable
                    product={product}
                    stock={stock}
                    money={money}
                    ordersHref={ordersHref}
                    onOpen={setOpenId}
                />
                <p className="text-pretty px-[18px] pb-3.5 text-[11.5px] text-muted-foreground">
                    {stockFootnote(stock.split)}
                    {tracking.control === "locked" ? ` ${TRACKING_LOCKED}` : ""}
                </p>
            </Card>
            <ProductChecks checks={checks} />
            <RecentChanges
                productId={product.id}
                productName={product.name}
                log={log}
                week={week}
                now={now}
            />
            {drawer}
        </div>
    );
}
