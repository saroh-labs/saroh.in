import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import type { ProductTab } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import {
    availability,
    heldByLine,
    sellableByStore,
} from "@/lib/products/overview-words";
import type { ProductStock } from "@/lib/stock/product-stock";

import { ProductStat } from "./overview-parts";

const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * "Can be sold now" — or, when open orders hold more than a shelf has,
 * "Short for orders already placed" as an alert, with Add stock and the
 * orders (#522). Across every storefront when their shelves could be read;
 * the address's storefront alone otherwise, said so.
 */
export function AvailabilityCard({
    overview,
    stock,
    multi,
    href,
}: {
    overview: ProductOverview;
    stock: ProductStock | null;
    multi: boolean;
    href: (tab: ProductTab) => string;
}) {
    const { product, orders } = overview;
    const t = overview.stock.totals;
    const totals = stock
        ? stock.totals
        : { ...t, short: Math.max(0, t.promised - t.onHand) };
    const perStore = stock
        ? sellableByStore(stock.byStore)
        : multi
          ? `at ${overview.storefront.name}`
          : null;
    const a = availability(totals, perStore);
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
    const held = heldByLine(
        totals.promised,
        orders.status === "ok" ? orders.data.openCount : null,
        // Sizes only when each is counted on its own.
        (stock ? stock.mode : overview.stock.mode) === "variant" ? bySize : [],
    );
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
            {held ? (
                <Link
                    href={href("orders")}
                    scroll={false}
                    className={cn(
                        FOCUS,
                        "mt-1.5 block text-pretty rounded-sm text-[11.5px] leading-[1.45] text-brand hover:text-foreground",
                    )}
                >
                    {held}
                </Link>
            ) : null}
            {a.short ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Button
                        asChild
                        size="sm"
                        className="h-[30px] rounded-lg px-[11px] text-[12.5px]"
                    >
                        <Link href={href("stock")} scroll={false}>
                            Add stock
                        </Link>
                    </Button>
                    <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-[30px] rounded-lg px-[11px] text-[12.5px]"
                    >
                        <Link href={href("orders")} scroll={false}>
                            See the orders
                        </Link>
                    </Button>
                </div>
            ) : null}
        </Card>
    );
}

/** "Variants · 2 · 800g ₹480 · 400g ₹260". */
export function VariantsStat({
    overview,
    money,
    href,
}: {
    overview: ProductOverview;
    money: (amount: string) => string;
    href: string | null;
}) {
    const { product } = overview;
    const stat = (
        <ProductStat
            className={
                href
                    ? "h-full transition-colors hover:border-border-strong"
                    : undefined
            }
            label="Variants"
            value={product.variants.length || "—"}
            hint={
                product.variants.length
                    ? product.variants
                          .map(
                              (v) =>
                                  `${v.title} ${money(v.price ?? product.price)}`,
                          )
                          .join(" · ")
                    : `Sold as itself at ${money(product.price)}`
            }
        />
    );
    if (!href) return stat;
    return (
        <Link
            href={href}
            scroll={false}
            aria-label="Variants — see sizes and prices"
            className={cn(FOCUS, "rounded-[12px]")}
        >
            {stat}
        </Link>
    );
}
