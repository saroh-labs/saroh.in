"use client";

import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ProductDetail } from "@/lib/products/service";
import type {
    ProductStock,
    ShelfTone,
    SizeStock,
} from "@/lib/stock/product-stock";
import { shelfName, warnsAt } from "@/lib/stock/product-stock";

/** The design's pills: in stock green, "Only N left" saffron, short or sold out red. */
export const TONE_BADGE: Record<
    ShelfTone,
    "success" | "draft" | "error" | "neutral"
> = {
    ok: "success",
    low: "draft",
    bad: "error",
    muted: "neutral",
};

const GRID =
    "grid grid-cols-[minmax(130px,1.4fr)_64px_68px_72px_68px_minmax(112px,1fr)] gap-2";

/**
 * Sizes and stock (#523): a row per size with its price and — across its
 * storefronts — on hand, promised and what can be sold, then a sub-row per
 * storefront when there is more than one. Promised links to the open
 * orders holding it. The table scrolls sideways inside itself on a phone,
 * with a fade saying there is more.
 */
export function StockTable({
    product,
    stock,
    money,
    ordersHref,
    onOpen,
}: {
    product: ProductDetail;
    stock: ProductStock;
    money: (amount: string) => string;
    ordersHref: string;
    /** Open a size's own page (the drawer); null for the product as a whole. */
    onOpen: (variantId: string) => void;
}) {
    const box = useRef<HTMLDivElement>(null);
    const [more, setMore] = useState(false);
    const measure = useCallback(() => {
        const el = box.current;
        if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    }, []);
    useEffect(() => {
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [measure]);

    const titleOf = (size: SizeStock) => {
        const v = product.variants.find((x) => x.id === size.variantId);
        if (v)
            return {
                title: v.title,
                sku: v.sku,
                price: v.price ?? product.price,
            };
        return {
            title:
                product.variants.length > 0
                    ? "The whole product"
                    : product.name,
            sku: null,
            price: product.variants.length > 0 ? null : product.price,
        };
    };

    return (
        <div className="relative">
            <div
                ref={box}
                onScroll={measure}
                className="overflow-x-auto px-[18px] pb-1"
            >
                <div
                    className="min-w-[540px]"
                    role="table"
                    aria-label={`${product.name}: stock by size and storefront`}
                >
                    <div
                        role="row"
                        className={cn(
                            GRID,
                            "border-b border-border pb-[7px] pt-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                        )}
                    >
                        <span role="columnheader">
                            {product.option?.name ?? "Size"}
                        </span>
                        <span role="columnheader" className="text-right">
                            Price
                        </span>
                        <span role="columnheader" className="text-right">
                            On hand
                        </span>
                        <span role="columnheader" className="text-right">
                            Promised
                        </span>
                        <span role="columnheader" className="text-right">
                            Can sell
                        </span>
                        <span role="columnheader" className="pl-2">
                            Shop shows
                        </span>
                    </div>
                    {stock.sizes.map((size) => {
                        const t = titleOf(size);
                        const open = size.variantId;
                        const warn = warnsAt(size, stock.split);
                        return (
                            <div
                                key={size.variantId ?? "product"}
                                className="border-b border-border"
                            >
                                <div
                                    role="row"
                                    onClick={
                                        open ? () => onOpen(open) : undefined
                                    }
                                    className={cn(
                                        GRID,
                                        "-mx-1.5 items-center rounded-md px-1.5 py-[11px] text-[13px]",
                                        open &&
                                            "cursor-pointer hover:bg-muted/60",
                                    )}
                                >
                                    <span
                                        role="cell"
                                        className="grid min-w-0 gap-px"
                                    >
                                        {open ? (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onOpen(open);
                                                }}
                                                aria-label={`Open ${t.title} details`}
                                                className="flex items-center gap-1.5 self-start rounded-sm text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                                            >
                                                {t.title}
                                                <ChevronRight
                                                    aria-hidden
                                                    strokeWidth={2.2}
                                                    className="size-3 text-muted-foreground"
                                                />
                                            </button>
                                        ) : (
                                            <span className="font-semibold">
                                                {t.title}
                                            </span>
                                        )}
                                        {t.sku ? (
                                            <span className="truncate font-mono text-[11px] text-muted-foreground">
                                                {t.sku}
                                            </span>
                                        ) : null}
                                    </span>
                                    <span
                                        role="cell"
                                        className="text-right tabular-nums"
                                    >
                                        {t.price ? money(t.price) : ""}
                                    </span>
                                    <span
                                        role="cell"
                                        className="text-right tabular-nums"
                                    >
                                        {size.onHand}
                                    </span>
                                    <span
                                        role="cell"
                                        className="text-right tabular-nums"
                                    >
                                        {size.promised}
                                    </span>
                                    <span
                                        role="cell"
                                        className={cn(
                                            "text-right font-semibold tabular-nums",
                                            size.short > 0 &&
                                                "text-destructive-subtle-foreground",
                                        )}
                                    >
                                        {size.canSell}
                                    </span>
                                    <span
                                        role="cell"
                                        className="grid justify-items-start gap-0.5 pl-2"
                                    >
                                        {stock.split ? null : (
                                            <ShelfBadge
                                                tone={size.word.tone}
                                                text={size.word.text}
                                            />
                                        )}
                                        {warn ? (
                                            <span className="text-[11px] text-muted-foreground">
                                                {warn}
                                            </span>
                                        ) : null}
                                    </span>
                                </div>
                                {stock.split
                                    ? size.shelves.map((shelf) => (
                                          <div
                                              key={shelf.storeId}
                                              role="row"
                                              className={cn(
                                                  GRID,
                                                  "items-center pb-[9px] text-[12.5px] text-neutral-700 dark:text-muted-foreground",
                                              )}
                                          >
                                              <span
                                                  role="cell"
                                                  className="flex min-w-0 items-center gap-[7px] pl-3.5"
                                              >
                                                  <span
                                                      aria-hidden
                                                      className="size-1.5 shrink-0 rounded-full bg-border-strong"
                                                  />
                                                  <span className="truncate">
                                                      {shelfName(
                                                          size,
                                                          shelf,
                                                          stock.split,
                                                      )}
                                                  </span>
                                              </span>
                                              <span role="cell" />
                                              <span
                                                  role="cell"
                                                  className="text-right tabular-nums"
                                              >
                                                  {shelf.onHand}
                                              </span>
                                              <span
                                                  role="cell"
                                                  className="text-right tabular-nums"
                                              >
                                                  {shelf.promised > 0 ? (
                                                      <Link
                                                          href={ordersHref}
                                                          scroll={false}
                                                          aria-label={`${shelf.promised} promised to open ${shelf.name} orders — open them`}
                                                          className="rounded-sm text-brand underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                      >
                                                          {shelf.promised}
                                                      </Link>
                                                  ) : (
                                                      <span className="text-muted-foreground">
                                                          0
                                                      </span>
                                                  )}
                                              </span>
                                              <span
                                                  role="cell"
                                                  className={cn(
                                                      "text-right font-semibold tabular-nums",
                                                      shelf.word.tone === "bad"
                                                          ? "text-destructive-subtle-foreground"
                                                          : "text-foreground",
                                                  )}
                                              >
                                                  {shelf.canSell}
                                              </span>
                                              <span
                                                  role="cell"
                                                  className="pl-2"
                                              >
                                                  <ShelfBadge
                                                      tone={shelf.word.tone}
                                                      text={shelf.word.text}
                                                  />
                                              </span>
                                          </div>
                                      ))
                                    : null}
                            </div>
                        );
                    })}
                    <div
                        role="row"
                        className={cn(
                            GRID,
                            "items-center pb-3 pt-[11px] text-[12.5px] text-muted-foreground",
                        )}
                    >
                        <span role="cell">Total</span>
                        <span role="cell" />
                        <span role="cell" className="text-right tabular-nums">
                            {stock.totals.onHand}
                        </span>
                        <span role="cell" className="text-right tabular-nums">
                            {stock.totals.promised}
                        </span>
                        <span
                            role="cell"
                            className="text-right font-semibold tabular-nums text-foreground"
                        >
                            {stock.totals.canSell}
                        </span>
                        <span role="cell" />
                    </div>
                </div>
            </div>
            {more ? (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-card"
                />
            ) : null}
        </div>
    );
}

export function ShelfBadge({ tone, text }: { tone: ShelfTone; text: string }) {
    return (
        <Badge
            variant={TONE_BADGE[tone]}
            className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-[1.3]"
        >
            {text}
        </Badge>
    );
}
