import { AbsentValue } from "@saroh/ui/absent-value";
import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { formatMoneyMajor } from "@/lib/format/money";
import type { ProductTab } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { stockCounts } from "@/lib/products/overview-rules";
import {
    availability,
    heldByLine,
    optionNoun,
    sellableByStore,
    stockException,
    variantsLine,
} from "@/lib/products/overview-words";
import type { ProductStock } from "@/lib/stock/product-stock";

import { StockSheetButton } from "@/components/commerce/product-stock/stock-sheet";
import { ProductStat } from "./overview-parts";

const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * "To sell" — or, when open orders hold more than a shelf has, "Short for
 * orders already placed" as an alert (#522). Across every storefront when
 * their shelves could be read; the address's storefront alone otherwise,
 * said so. When something is out or low it is named under the figure
 * with its fix beside it: "7.44 is out · 2 low · Add stock", which opens
 * the stock sheet with those rows first. Archived, it is what is on hand,
 * not for sale.
 */
export function AvailabilityCard({
    overview,
    storeId,
    stock,
    multi,
    href,
}: {
    overview: ProductOverview;
    storeId: string;
    stock: ProductStock | null;
    multi: boolean;
    href: (tab: ProductTab) => string;
}) {
    const { product, orders } = overview;
    const archived = product.status === "ARCHIVED";
    const t = overview.stock.totals;
    const totals = stock
        ? stock.totals
        : { ...t, short: Math.max(0, t.promised - t.onHand) };
    const perStore = stock
        ? sellableByStore(stock.byStore)
        : multi
          ? `at ${overview.storefront.name}`
          : null;
    const a = availability(totals, perStore, archived);
    const titleOf = (variantId: string | null) =>
        product.variants.find((v) => v.id === variantId)?.title ?? product.name;
    const bySize = stock
        ? stock.sizes.map((s) => ({
              title: titleOf(s.variantId),
              promised: s.promised,
          }))
        : overview.stock.variants.map((l) => ({
              title: titleOf(l.variantId),
              promised: l.promised,
          }));
    const seesOrders = orders.status === "ok";
    const held = archived
        ? null
        : heldByLine(
              totals.promised,
              seesOrders ? orders.data.openCount : null,
              // Sizes only when each is counted on its own.
              (stock ? stock.mode : overview.stock.mode) === "variant"
                  ? bySize
                  : [],
          );
    const exception =
        archived || a.short
            ? null
            : stockException(overview.stock, titleOf, product.option?.name);
    const addStock = (first: readonly string[]) =>
        overview.canStock ? (
            <StockSheetButton
                overview={overview}
                storeId={storeId}
                stock={stock}
                counts
                label="Add stock"
                size="sm"
                variant={a.short ? "default" : "outline"}
                icon={false}
                first={first}
            />
        ) : null;
    // Each place's shelf, adding up to the figure (HPProductDesk): the
    // same 440 the editor's All locations row says.
    const places = stock && !archived ? stock.byStore : [];
    // Each size counted on its own, at its own price (HPProductVariantsDesk):
    // the card is the sizes' table, and the Variants card isn't drawn.
    const sizes = sizeRows(overview, stock, archived);
    const table = places.length > 0 || sizes.length > 0;
    return (
        <Card
            role={a.short ? "alert" : "group"}
            aria-label={a.short ? undefined : a.label}
            className={cn(
                "rounded-[12px] px-4 py-3.5",
                a.short &&
                    "border-destructive-subtle-foreground bg-destructive-subtle",
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                <p
                    className={cn(
                        "mr-auto text-[14px] font-semibold",
                        a.short && "text-destructive-subtle-foreground",
                    )}
                >
                    {sizes.length > 0 && !a.short
                        ? `${optionTitle(product.option?.name)} and stock`
                        : a.label}
                </p>
                {table && !a.short ? (
                    <>
                        <Button asChild size="sm" variant="outline">
                            <Link href={href("stock")} scroll={false}>
                                Count stock
                            </Link>
                        </Button>
                        {overview.canStock ? (
                            <StockSheetButton
                                overview={overview}
                                storeId={storeId}
                                stock={stock}
                                counts
                                label="Add stock"
                                size="sm"
                                variant="default"
                            />
                        ) : null}
                    </>
                ) : null}
            </div>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                    className={cn(
                        "font-display tabular-nums leading-tight",
                        table
                            ? "text-[40px] font-semibold tracking-[-0.03em]"
                            : "text-[22px] font-semibold",
                        a.short && "text-destructive-subtle-foreground",
                    )}
                >
                    {a.figure}
                </span>
                {table && !a.short ? (
                    <span className="text-[13px] text-muted-foreground">
                        {sizes.length > 0
                            ? `to sell · counted for each ${optionNoun(product.option?.name, 1)}`
                            : `of ${totals.onHand} on hand`}
                    </span>
                ) : null}
            </p>
            {table && !a.short ? null : (
                <p className="mt-0.5 text-pretty text-[11.5px] text-muted-foreground">
                    {a.note}
                </p>
            )}
            {held && seesOrders ? (
                <Link
                    href={href("orders")}
                    scroll={false}
                    className={cn(
                        FOCUS,
                        "mt-1.5 block text-pretty rounded-sm text-[11.5px] leading-[1.45] text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-fast hover:decoration-foreground active:text-muted-foreground",
                    )}
                >
                    {held}
                </Link>
            ) : held ? (
                <p className="mt-1.5 text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                    {held}
                </p>
            ) : null}
            {exception ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <p
                        role="status"
                        className="text-pretty text-[12.5px] font-medium text-warning-subtle-foreground"
                    >
                        {exception.text}
                    </p>
                    {addStock(exception.variantIds)}
                </div>
            ) : null}
            {a.short ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {addStock([])}
                    {seesOrders ? (
                        <Button asChild size="sm" variant="outline">
                            <Link href={href("orders")} scroll={false}>
                                See the orders
                            </Link>
                        </Button>
                    ) : null}
                </div>
            ) : null}
            {sizes.length > 0 ? (
                <SizesTable
                    option={optionTitle(product.option?.name)}
                    rows={sizes}
                />
            ) : places.length > 0 ? (
                <div
                    role="table"
                    aria-label="Stock by location"
                    className="mt-3 text-[13.5px]"
                >
                    <div
                        role="row"
                        data-ph-unmask=""
                        className="label grid grid-cols-[minmax(0,1fr)_72px_64px] py-1.5 text-muted-foreground sm:grid-cols-[minmax(0,1fr)_96px_80px]"
                    >
                        <span role="columnheader">Location</span>
                        <span role="columnheader" className="text-right">
                            On hand
                        </span>
                        <span role="columnheader" className="text-right">
                            To sell
                        </span>
                    </div>
                    {places.map((p) => (
                        <div
                            role="row"
                            key={p.storeId}
                            className="grid grid-cols-[minmax(0,1fr)_72px_64px] border-t border-border py-2.5 sm:grid-cols-[minmax(0,1fr)_96px_80px]"
                        >
                            <span role="cell">{p.name}</span>
                            <span
                                role="cell"
                                className="text-right tabular-nums"
                            >
                                {p.onHand}
                            </span>
                            <span
                                role="cell"
                                className="text-right font-semibold tabular-nums"
                            >
                                {p.canSell}
                            </span>
                        </div>
                    ))}
                </div>
            ) : null}
        </Card>
    );
}

/** "Size", "Shade", "Variant": the option's own word, for a heading. */
function optionTitle(option: string | null | undefined): string {
    const w = optionNoun(option, 1);
    return w.charAt(0).toUpperCase() + w.slice(1);
}

interface SizeRow {
    id: string;
    title: string;
    sku: string;
    price: string;
    canSell: number;
    flag: "low" | "out" | null;
}

/**
 * A row per size when each is counted on its own and there are several
 * (HPProductVariantsDesk): its name, SKU, price and what it can sell, with
 * low or out said in the late colour. None otherwise.
 */
export function sizeRows(
    overview: ProductOverview,
    stock: ProductStock | null,
    archived: boolean,
): SizeRow[] {
    const { product } = overview;
    if (!stock || archived || stock.mode !== "variant") return [];
    if (stock.sizes.length < 2) return [];
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency);
    return stock.sizes.flatMap((size) => {
        const v = product.variants.find((x) => x.id === size.variantId);
        if (!v) return [];
        return [
            {
                id: v.id,
                title: v.title,
                sku: v.sku,
                price: money(v.price ?? product.price),
                canSell: size.canSell,
                flag:
                    size.canSell <= 0
                        ? "out"
                        : size.warnAt > 0 && size.canSell <= size.warnAt
                          ? "low"
                          : null,
            },
        ];
    });
}

function SizesTable({
    option,
    rows,
}: {
    option: string;
    rows: readonly SizeRow[];
}) {
    const cols =
        "grid grid-cols-[minmax(0,1fr)_72px_64px_72px] sm:grid-cols-[minmax(0,1fr)_96px_72px_88px]";
    return (
        <div
            role="table"
            aria-label={`${option}s and stock`}
            className="mt-3 text-[13.5px]"
        >
            <div
                role="row"
                data-ph-unmask=""
                className={cn("label py-1.5 text-muted-foreground", cols)}
            >
                <span role="columnheader">{option}</span>
                <span role="columnheader" className="text-right">
                    SKU
                </span>
                <span role="columnheader" className="text-right">
                    Price
                </span>
                <span role="columnheader" className="text-right">
                    To sell
                </span>
            </div>
            {rows.map((r) => (
                <div
                    role="row"
                    key={r.id}
                    className={cn("border-t border-border py-2.5", cols)}
                >
                    <span role="cell" className="truncate font-semibold">
                        {r.title}
                    </span>
                    <span
                        role="cell"
                        className="truncate text-right font-mono text-[12px] text-muted-foreground"
                    >
                        {r.sku}
                    </span>
                    <span role="cell" className="text-right tabular-nums">
                        {r.price}
                    </span>
                    <span
                        role="cell"
                        className={cn(
                            "text-right font-semibold tabular-nums",
                            r.flag && "text-destructive-subtle-foreground",
                        )}
                    >
                        {r.canSell}
                        {r.flag ? ` · ${r.flag}` : ""}
                    </span>
                </div>
            ))}
        </div>
    );
}

/** Variants listed on the card before "N more". */
const VARIANTS_SHOWN = 6;

/** "Variants · 28 shades · ₹420 each · 1 out". */
export function VariantsStat({
    overview,
    money,
    href,
    counts,
}: {
    overview: ProductOverview;
    money: (amount: string) => string;
    href: string | null;
    /** The product counts stock: its out count is said. */
    counts: boolean;
}) {
    const { product } = overview;
    const prices = product.variants.map((v) => v.price ?? product.price);
    const nums = prices.map(Number);
    const at = (n: number) => prices[nums.indexOf(n)] ?? product.price;
    const stat = (
        <ProductStat
            className={
                href
                    ? "h-full transition-colors duration-fast hover:border-border-strong"
                    : undefined
            }
            label={(() => {
                const w = optionNoun(product.option?.name, 2);
                return w.charAt(0).toUpperCase() + w.slice(1);
            })()}
            value={product.variants.length || <AbsentValue says="None" />}
            hint={
                product.variants.length
                    ? variantsLine(
                          {
                              count: product.variants.length,
                              optionName: product.option?.name,
                              min: at(Math.min(...nums)),
                              max: at(Math.max(...nums)),
                              out:
                                  counts && overview.stock.mode === "variant"
                                      ? stockCounts(overview.stock).out
                                      : null,
                          },
                          money,
                      )
                    : `Sold as itself at ${money(product.price)}`
            }
        >
            {/* Each by name, SKU and price (HPProductDesk). */}
            {product.variants.length > 0 ? (
                <ul className="mt-2.5 grid">
                    {product.variants.slice(0, VARIANTS_SHOWN).map((v) => (
                        <li
                            key={v.id}
                            className="flex items-baseline gap-2 border-t border-border py-2 text-[13.5px]"
                        >
                            <span className="truncate font-semibold">
                                {v.title}
                            </span>
                            <span className="truncate font-mono text-[12px] text-muted-foreground">
                                {v.sku}
                            </span>
                            <span className="ml-auto tabular-nums">
                                {money(v.price ?? product.price)}
                            </span>
                        </li>
                    ))}
                    {product.variants.length > VARIANTS_SHOWN ? (
                        <li className="border-t border-border pt-2 text-[12.5px] text-muted-foreground">
                            {product.variants.length - VARIANTS_SHOWN} more on
                            the Variants tab
                        </li>
                    ) : null}
                </ul>
            ) : null}
        </ProductStat>
    );
    if (!href) return stat;
    return (
        <Link
            href={href}
            scroll={false}
            aria-label="Variants, see each and its price"
            className={cn(FOCUS, "rounded-[12px]")}
        >
            {stat}
        </Link>
    );
}
