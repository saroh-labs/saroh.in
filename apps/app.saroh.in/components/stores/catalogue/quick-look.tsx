"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { ArrowRight, ChevronDown, ChevronUp, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { formatMoneyMajor } from "@/lib/format/money";
import type { CatalogueRow } from "@/lib/products/catalogue";
import { productEditHref, productHref } from "@/lib/products/links";
import { position } from "@/lib/products/quick-look";
import type { ProductStatus } from "@/lib/products/service";

import { ProductThumb } from "./product-thumb";
import { StockBlock } from "./quick-look-stock";
import { STATUS_LABEL, STATUS_VARIANT } from "./tones";

/**
 * The list's quick look (#520, the design's drawer): status, where it is in
 * the list ("3 of 12", J/K and the arrows), price, stock — can sell, on
 * hand, promised, short — per variant with "+N · Add", where it sells, and
 * the way out to the product page and the Editor. Stop selling archives it
 * and Sell again publishes it (DEC-032), each with Undo.
 *
 * Deliberate additions beyond the list design: the per-storefront line
 * ("Sold out at Online · 4 at Hill Road", from Product Detail), and Undo on
 * Stop selling. With more than one storefront in view, Add asks where.
 */
export function QuickLook({
    row,
    index,
    total,
    storeId,
    canWrite,
    canStock,
    onStep,
    onClose,
    onStatus,
    onChanged,
}: {
    row: CatalogueRow | null;
    index: number;
    total: number;
    /** The storefront filter, or null for every storefront. */
    storeId: string | null;
    /** `store:write`: Stop selling, Sell again, Edit. */
    canWrite: boolean;
    /** Count and move stock: "+N · Add". */
    canStock: boolean;
    onStep: (by: 1 | -1) => void;
    onClose: () => void;
    onStatus: (row: CatalogueRow, status: ProductStatus) => void;
    /** Stock changed: read the rows again. */
    onChanged: () => void;
}) {
    // J/K and the arrows walk the list while the drawer is open — but not
    // while typing a number into an Add box.
    useEffect(() => {
        if (!row) return;
        function onKey(e: KeyboardEvent) {
            const tag = (e.target as HTMLElement | null)?.tagName ?? "";
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
                return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === "j" || e.key === "ArrowDown") {
                e.preventDefault();
                onStep(1);
            } else if (e.key === "k" || e.key === "ArrowUp") {
                e.preventDefault();
                onStep(-1);
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [row, onStep]);

    const place =
        (storeId ? row?.places.find((p) => p.storeId === storeId) : null) ??
        row?.places[0];
    const pageHref = row ? productHref(place?.storeId, row.id) : "#";
    const editHref = row ? productEditHref(place?.storeId, row.id) : "#";

    return (
        <Sheet
            open={!!row}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <SheetContent
                side="right"
                closeButton={false}
                className="flex w-[380px] max-w-[90vw] flex-col gap-0 p-0 sm:max-w-[380px]"
            >
                {row ? (
                    <>
                        <div className="flex items-center gap-2.5 border-b border-muted px-[18px] py-4">
                            <Badge
                                variant={STATUS_VARIANT[row.status]}
                                className="px-[9px] py-[3px] text-[11px] font-medium"
                            >
                                {STATUS_LABEL[row.status]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                                {position(index, total)}
                            </span>
                            <div className="ml-auto flex gap-0.5">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-neutral-700 coarse:size-11 dark:text-foreground"
                                    onClick={() => onStep(-1)}
                                    aria-label="Previous product (K)"
                                    title="Previous (K)"
                                >
                                    <ChevronUp className="size-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-neutral-700 coarse:size-11 dark:text-foreground"
                                    onClick={() => onStep(1)}
                                    aria-label="Next product (J)"
                                    title="Next (J)"
                                >
                                    <ChevronDown className="size-4" />
                                </Button>
                            </div>
                            <SheetClose asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-neutral-600 coarse:size-11 dark:text-foreground"
                                    aria-label="Close (Esc)"
                                >
                                    <X className="size-4" strokeWidth={2.1} />
                                </Button>
                            </SheetClose>
                        </div>
                        <div className="flex-1 overflow-y-auto p-[18px]">
                            <div className="mb-[18px] flex items-center gap-[13px]">
                                <ProductThumb
                                    name={row.name}
                                    image={row.image}
                                    size={52}
                                />
                                <div className="min-w-0">
                                    <SheetTitle className="text-pretty font-display text-[19px] font-semibold tracking-[-0.025em]">
                                        {row.name}
                                    </SheetTitle>
                                    <SheetDescription className="mt-[3px] font-mono text-[11px]">
                                        {row.sku ? `SKU ${row.sku}` : "No SKU"}
                                    </SheetDescription>
                                </div>
                            </div>
                            <dl className="flex flex-col gap-[11px]">
                                <Line label="Price" center>
                                    <PriceBlock row={row} />
                                </Line>
                                <StockBlock
                                    key={row.id}
                                    row={row}
                                    storeId={storeId}
                                    canStock={canStock}
                                    onChanged={onChanged}
                                />
                                <Line label="Sold at" center>
                                    <span className="text-[13px]">
                                        {row.places.length > 0
                                            ? row.places
                                                  .map((p) => p.storeName)
                                                  .join(" · ")
                                            : "Not sold anywhere yet"}
                                    </span>
                                </Line>
                                <Line label="Updated" center last>
                                    <span className="font-mono text-[12px]">
                                        {new Date(row.updatedAt).toLocaleString(
                                            "en-GB",
                                            {
                                                day: "numeric",
                                                month: "short",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            },
                                        )}
                                    </span>
                                </Line>
                            </dl>
                        </div>
                        <div className="flex flex-wrap items-center gap-[9px] border-t border-muted px-[18px] py-3.5">
                            <Button asChild variant="outline">
                                <Link href={pageHref}>Open product page</Link>
                            </Button>
                            {canWrite || canStock ? (
                                <Button asChild>
                                    <Link href={editHref}>
                                        Edit
                                        <ArrowRight className="ml-1.5 size-3.5" />
                                    </Link>
                                </Button>
                            ) : null}
                            {canWrite ? (
                                <SellToggle row={row} onStatus={onStatus} />
                            ) : null}
                        </div>
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

/** Stop selling (archive) · Sell again (publish) · Publish a draft. */
function SellToggle({
    row,
    onStatus,
}: {
    row: CatalogueRow;
    onStatus: (row: CatalogueRow, status: ProductStatus) => void;
}) {
    const selling = row.status === "PUBLISHED";
    const label = selling
        ? "Stop selling"
        : row.status === "ARCHIVED"
          ? "Sell again"
          : "Publish";
    return (
        <Button
            variant="ghost"
            className={cn(
                "ml-auto px-3",
                selling
                    ? "text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
                    : "text-foreground",
            )}
            onClick={() => onStatus(row, selling ? "ARCHIVED" : "PUBLISHED")}
        >
            {label}
        </Button>
    );
}

function PriceBlock({ row }: { row: CatalogueRow }) {
    const money = (v: string) => formatMoneyMajor(v, row.currency) ?? "—";
    return (
        <div className="min-w-0">
            <div className="font-display text-[14px] font-semibold tabular-nums tracking-[-0.02em]">
                {row.priceRange
                    ? `${money(row.priceRange.low)} – ${money(row.priceRange.high)}`
                    : money(row.price)}
            </div>
            {row.priceRange ? (
                <p className="mt-[3px] text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                    Set by its variants. The product&apos;s own price is{" "}
                    {money(row.price)}.
                </p>
            ) : null}
        </div>
    );
}

function Line({
    label,
    center = false,
    last = false,
    children,
}: {
    label: string;
    center?: boolean;
    last?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "flex gap-3",
                center ? "items-center" : "items-baseline",
                !last && "border-b border-muted pb-[11px]",
            )}
        >
            <dt className="w-[86px] shrink-0 text-[12.5px] text-muted-foreground">
                {label}
            </dt>
            <dd className="flex min-w-0 items-center">{children}</dd>
        </div>
    );
}
