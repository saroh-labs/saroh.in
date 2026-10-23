import { AbsentValue } from "@saroh/ui/absent-value";
import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

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
    return (
        <Card
            role={a.short ? "alert" : "group"}
            aria-label={a.short ? undefined : a.label}
            className={cn(
                "rounded-[12px] px-[15px] py-[13px]",
                a.short &&
                    "border-destructive-subtle-foreground bg-destructive-subtle",
            )}
        >
            <p
                className={cn(
                    "text-[11.5px]",
                    a.short
                        ? "text-destructive-subtle-foreground"
                        : "text-muted-foreground",
                )}
            >
                {a.label}
            </p>
            <p
                className={cn(
                    "mt-1 font-display text-[22px] font-semibold tabular-nums leading-tight",
                    a.short && "text-destructive-subtle-foreground",
                )}
            >
                {a.figure}
            </p>
            <p className="mt-0.5 text-pretty text-[11.5px] text-muted-foreground">
                {a.note}
            </p>
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
        </Card>
    );
}

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
        />
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
