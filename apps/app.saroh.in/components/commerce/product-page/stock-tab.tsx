"use client";

import { Card } from "@saroh/ui/card";
import { Box } from "lucide-react";
import { useState } from "react";

import { formatMoneyMajor } from "@/lib/format/money";
import {
    canStartCounting,
    SPLIT_NEEDS_WRITE,
} from "@/lib/products/editor-stock";
import type { ProductOverview } from "@/lib/products/overview-rules";
import { optionNoun } from "@/lib/products/overview-words";
import type { ProductTracking } from "@/lib/products/tracking";
import { TRACKING_LOCKED, untrackedShort } from "@/lib/products/tracking";
import type { ProductStock } from "@/lib/stock/product-stock";
import { stockFootnote } from "@/lib/stock/product-stock";
import type { StockCheck, StockLogEntry } from "@/lib/stock/service";

import { PanelFailed, TabState } from "./panel-state";
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
        formatMoneyMajor(amount, product.currency);
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
            stock={stock}
        />
    );

    if (!counts) {
        return (
            <div className="flex flex-col gap-3">
                <TabState
                    data-ph-mask=""
                    icon={Box}
                    title="Not tracked"
                    description={`${untrackedShort(product.storefronts ?? [])} ${
                        product.variants.length
                            ? `Sold in ${product.variants.length} ${optionNoun(product.option?.name, product.variants.length)}: ${product.variants
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
                        />
                    ) : null}
                </TabState>
                {product.variants.length > 0 ? (
                    <Card className="rounded-[12px] p-0">
                        <ul
                            aria-label={`${cap(optionNoun(product.option?.name, 2))} and prices`}
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
        return <PanelFailed what="stock" retryHref={retryHref} />;
    }

    if (!counted) {
        return (
            <TabState
                data-ph-mask=""
                icon={Box}
                title="No stock count yet"
                description={
                    product.variants.length
                        ? `Each of the ${product.variants.length} ${optionNoun(product.option?.name, product.variants.length)} gets its own count, so one can run out before another.`
                        : "Add a count to see how many you have and get a warning when it runs low."
                }
            >
                {canStartCounting(overview, product.variants.length) ? (
                    <StockSheetButton
                        overview={overview}
                        storeId={storeId}
                        stock={stock}
                        counts
                        label="Add stock"
                        openFromAddress
                    />
                ) : overview.canStock ? (
                    // With variants, the first count is the switch to
                    // counting each one: the API asks store:write for it.
                    <p className="max-w-[46ch] text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                        {SPLIT_NEEDS_WRITE}
                    </p>
                ) : null}
            </TabState>
        );
    }

    return (
        <div className="flex flex-col">
            <Card className="rounded-[12px] p-0">
                <div className="flex flex-wrap items-center gap-2 px-[18px] pb-1 pt-3.5">
                    <h2 className="font-display text-[15px] font-semibold tracking-[-0.015em]">
                        {product.variants.length
                            ? `${cap(optionNoun(product.option?.name, 2))} and stock`
                            : "Stock"}
                    </h2>
                    <span className="min-w-0 flex-[1_1_200px] text-[12px] text-muted-foreground">
                        {log?.at(0) ? <LastChange entry={log[0]} /> : null}
                    </span>
                    {overview.canStock ? (
                        <StockSheetButton
                            overview={overview}
                            storeId={storeId}
                            stock={stock}
                            counts
                            openFromAddress
                        />
                    ) : null}
                    {tracking.control === "change" ? (
                        <StopTrackingButton
                            productId={product.id}
                            productName={product.name}
                            storeId={storeId}
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

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
