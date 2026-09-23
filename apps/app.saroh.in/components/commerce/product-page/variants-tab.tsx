"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/data-state";
import { ChevronRight, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatMoneyMajor } from "@/lib/format/money";
import { productEditHref } from "@/lib/products/links";
import type { ProductOverview, StockLine } from "@/lib/products/overview-rules";
import { customersSee } from "@/lib/products/overview-rules";

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
}: {
    overview: ProductOverview;
    storeId: string;
}) {
    const { product, stock } = overview;
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
                <EmptyState
                    title="Sold as itself"
                    description={`No sizes or shades, so every order is for "${product.name}" at ${money(product.price)}.${stock.product ? "" : " There is no stock count yet either."}`}
                    action={
                        overview.canWrite ? (
                            <div className="flex flex-wrap justify-center gap-2">
                                <Button asChild variant="outline">
                                    <Link href={edit("variants")}>
                                        Add variants
                                    </Link>
                                </Button>
                                {stock.product ? null : (
                                    <Button asChild variant="outline">
                                        <Link href={edit("stock")}>
                                            Add stock
                                        </Link>
                                    </Button>
                                )}
                            </div>
                        ) : undefined
                    }
                />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            <Card className="overflow-x-auto bg-card p-0">
                <table className="w-full min-w-[720px] text-[13px]">
                    <caption className="sr-only">
                        Variants of {product.name} with price and stock
                    </caption>
                    <thead>
                        <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            <th scope="col" className="px-4 py-2.5">
                                {product.option?.name ?? "Variant"}
                            </th>
                            <th scope="col" className="px-3 py-2.5">
                                SKU
                            </th>
                            <th scope="col" className="px-3 py-2.5 text-right">
                                Price
                            </th>
                            <th scope="col" className="px-3 py-2.5 text-right">
                                On hand
                            </th>
                            <th scope="col" className="px-3 py-2.5 text-right">
                                Promised
                            </th>
                            <th scope="col" className="px-3 py-2.5 text-right">
                                Can sell
                            </th>
                            <th scope="col" className="px-4 py-2.5">
                                Customers see
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {product.variants.map((v) => {
                            const line = lineOf(v.id);
                            return (
                                <tr
                                    key={v.id}
                                    className="border-b border-border last:border-0 hover:bg-muted/50"
                                >
                                    <td className="px-4 py-2.5">
                                        <button
                                            type="button"
                                            onClick={() => setOpenId(v.id)}
                                            aria-label={`Open ${v.title} details`}
                                            className="flex items-center gap-1 text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                                        >
                                            {v.title}
                                            <ChevronRight
                                                aria-hidden
                                                className="size-3.5 text-muted-foreground"
                                            />
                                        </button>
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-[11.5px]">
                                        {v.sku}
                                    </td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">
                                        {money(v.price ?? product.price)}
                                        {v.price === null ? (
                                            <span className="sr-only">
                                                {" "}
                                                (the product&apos;s price)
                                            </span>
                                        ) : null}
                                    </td>
                                    <Num value={line?.onHand} />
                                    <Num value={line?.promised} />
                                    <Num value={line?.canSell} strong />
                                    <td className="px-4 py-2.5">
                                        {line ? (
                                            <Badge
                                                variant={WORD_BADGE[line.word]}
                                            >
                                                {customersSee(line)}
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground">
                                                Counted with the product
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        <tr className="border-t border-border bg-muted/40 font-medium">
                            <td className="px-4 py-2.5" colSpan={3}>
                                Whole product
                            </td>
                            <Num value={stock.totals.onHand} />
                            <Num value={stock.totals.promised} />
                            <Num value={stock.totals.canSell} strong />
                            <td className="px-4 py-2.5" />
                        </tr>
                    </tbody>
                </table>
            </Card>
            <div className="flex flex-wrap items-center gap-3">
                {overview.canWrite ? (
                    <Button asChild variant="outline" size="sm">
                        <Link href={edit("stock")}>
                            <Pencil aria-hidden />
                            Edit prices and stock
                        </Link>
                    </Button>
                ) : null}
                <p className="text-[12.5px] text-muted-foreground">
                    {stock.mode === "product"
                        ? "Stock is counted for the product as a whole. Count each variant on its own in the editor's Stock section."
                        : "Can sell is on hand minus what is promised to orders — the number the shop uses. Open a variant for its orders, reviews and photo."}
                </p>
            </div>

            <VariantDrawer
                overview={overview}
                storeId={storeId}
                variantId={openId}
                onClose={() => setOpenId(null)}
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
}: {
    value: number | undefined;
    strong?: boolean;
}) {
    return (
        <td
            className={`px-3 py-2.5 text-right tabular-nums ${strong ? "font-semibold" : ""}`}
        >
            {value ?? "—"}
        </td>
    );
}
