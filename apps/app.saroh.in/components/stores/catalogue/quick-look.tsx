"use client";

import { ViewerDate } from "@/components/shared/viewer-date";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import {
    Archive,
    ArrowRight,
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    MoreHorizontal,
    Trash2,
    X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { PausedNote } from "@/components/billing/paused-banner";
import { pausedWords } from "@/lib/billing/paused";
import { formatMoneyMajor } from "@/lib/format/money";
import type { CatalogueRow } from "@/lib/products/catalogue";
import { productEditHref, productHref } from "@/lib/products/links";
import type { NeedDetail } from "@/lib/products/needs-you";
import type { SellsOnline } from "@/lib/products/quick-look";
import { position, sellLine } from "@/lib/products/quick-look";
import type { ProductStatus } from "@/lib/products/service";

import { IconButton } from "@saroh/ui/icon-button";
import { ProductThumb } from "./product-thumb";
import { StockBlock } from "./quick-look-stock";
import { STATUS_LABEL, STATUS_VARIANT } from "./tones";

/**
 * The list's quick look (#520, the design's drawer): status, where it is in
 * the list ("3 of 12", J/K and the arrows), price, stock — can sell, on
 * hand, promised, short — per variant with "+N · Add", where it sells, and
 * the way out to the product page and the Editor. Archive takes it off sale
 * and Sell again publishes it (DEC-032), each with Undo.
 *
 * Deliberate additions beyond the list design: the per-storefront line
 * ("Sold out at Online · 4 at Hill Road", from Product Detail), and Undo on
 * Archive. With more than one storefront in view, Add asks where.
 *
 * Opening it puts the keyboard on the title (a screen reader hears the
 * product, and no button's tooltip fires), or on the Add box of the shelf
 * that needs it when Restock opened it. The name is the way to the
 * product page; the ⋯ menu holds what the row's menu does — Archive (or
 * Publish, Sell again) with its consequence, Duplicate, then Delete.
 */
export function QuickLook({
    row,
    index,
    total,
    storeId,
    canWrite,
    canStock,
    canOrders = false,
    need = null,
    focusAdd = false,
    atFirst,
    atLast,
    sellsOnline = null,
    onStep,
    onClose,
    onStatus,
    onDuplicate,
    onDelete,
    onChanged,
}: {
    row: CatalogueRow | null;
    index: number;
    total: number;
    /** What Needs you says about it: the headline names the exception. */
    need?: NeedDetail | null;
    /** Opened by Restock: the keyboard goes to the Add box that needs it. */
    focusAdd?: boolean;
    /** At the list's first or last row: Previous or Next does nothing. */
    atFirst: boolean;
    atLast: boolean;
    /** The online shop is live (null: unknown), for the menu's lines. */
    sellsOnline?: SellsOnline;
    /** The storefront filter, or null for every storefront. */
    storeId: string | null;
    /** `store:write`: Archive, Sell again, Edit. */
    canWrite: boolean;
    /** Count and move stock: "+N · Add". */
    canStock: boolean;
    /** `order:read`: a short product links its open orders (U5). */
    canOrders?: boolean;
    onStep: (by: 1 | -1) => void;
    onClose: () => void;
    onStatus: (row: CatalogueRow, status: ProductStatus) => void;
    onDuplicate: (row: CatalogueRow) => void;
    onDelete: (row: CatalogueRow) => void;
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

    const content = useRef<HTMLDivElement>(null);
    const title = useRef<HTMLHeadingElement>(null);
    const coarse = useCoarsePointer();
    // Restock opened it (or moved it to another product): the keyboard
    // goes to the first Add box — the shelves that need someone come first.
    const rowId = row?.id;
    useEffect(() => {
        if (!rowId || !focusAdd) return;
        const frame = requestAnimationFrame(() => {
            content.current
                ?.querySelector<HTMLInputElement>("[data-add-input]")
                ?.focus();
        });
        return () => cancelAnimationFrame(frame);
    }, [rowId, focusAdd]);

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
                ref={content}
                side="right"
                closeButton={false}
                onOpenAutoFocus={(e) => {
                    // Not the first button (its tooltip would open): the
                    // title, or the Add box when Restock opened it.
                    e.preventDefault();
                    if (!focusAdd) title.current?.focus();
                }}
                className="flex w-[380px] max-w-[90vw] flex-col gap-0 p-0 sm:max-w-[380px]"
            >
                {row ? (
                    <>
                        <div className="flex items-center gap-2.5 border-b border-muted px-[18px] py-4">
                            <Badge
                                variant={STATUS_VARIANT[row.status]}
                                size="sm"
                            >
                                {STATUS_LABEL[row.status]}
                            </Badge>
                            {row.paused ? (
                                // Past the plan's products limit (#800).
                                <Badge variant="warning" size="sm">
                                    Paused
                                </Badge>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                                {position(index, total)}
                            </span>
                            <div className="ml-auto flex gap-0.5">
                                {/* IconButton's label is its tooltip: no Tip around it. */}
                                <IconButton
                                    label={
                                        coarse
                                            ? "Previous product"
                                            : "Previous product (K)"
                                    }
                                    icon={<ChevronUp />}
                                    variant="ghost"
                                    aria-disabled={atFirst || undefined}
                                    className={cn(
                                        atFirst &&
                                            "cursor-default opacity-40 hover:bg-transparent",
                                    )}
                                    onClick={() => {
                                        if (!atFirst) onStep(-1);
                                    }}
                                />
                                <IconButton
                                    label={
                                        coarse
                                            ? "Next product"
                                            : "Next product (J)"
                                    }
                                    icon={<ChevronDown />}
                                    variant="ghost"
                                    aria-disabled={atLast || undefined}
                                    className={cn(
                                        atLast &&
                                            "cursor-default opacity-40 hover:bg-transparent",
                                    )}
                                    onClick={() => {
                                        if (!atLast) onStep(1);
                                    }}
                                />
                            </div>
                            <SheetClose asChild>
                                <IconButton
                                    label={coarse ? "Close" : "Close (Esc)"}
                                    icon={<X />}
                                    variant="ghost"
                                />
                            </SheetClose>
                        </div>
                        <div className="flex-1 overflow-y-auto p-[18px]">
                            {row.paused ? (
                                // Why, in words: read-only as the Editor is.
                                <PausedNote className="mb-[14px]">
                                    {pausedWords("product")}
                                </PausedNote>
                            ) : null}
                            <div className="mb-[18px] flex items-center gap-[13px]">
                                <ProductThumb
                                    name={row.name}
                                    image={row.image}
                                    size={52}
                                />
                                <div className="min-w-0 flex-1">
                                    <SheetTitle
                                        ref={title}
                                        tabIndex={-1}
                                        className="text-pretty rounded-sm font-display text-[19px] font-semibold tracking-[-0.025em] outline-none"
                                    >
                                        {/* The name is the way to the full
                                            page, in this tab. A role that
                                            can't edit has the footer's
                                            "Open product page" instead: one
                                            way, not two. */}
                                        {canWrite || canStock ? (
                                            <Link
                                                href={pageHref}
                                                className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {row.name}
                                            </Link>
                                        ) : (
                                            row.name
                                        )}
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
                                    canOrders={canOrders}
                                    need={need}
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
                                        <ViewerDate
                                            iso={row.updatedAt}
                                            variant="datetime"
                                        />
                                    </span>
                                </Line>
                            </dl>
                        </div>
                        {/* Edit as the strong next step; the menu holds
                            what the row's does. The page is the name; a role
                            that can't edit gets it here, in words. */}
                        <div className="flex items-center gap-2 border-t border-muted px-[18px] py-3.5">
                            {canWrite || canStock ? null : (
                                <Button
                                    asChild
                                    variant="outline"
                                    className="flex-1"
                                >
                                    <Link href={pageHref}>
                                        Open product page
                                    </Link>
                                </Button>
                            )}
                            {canWrite || canStock ? (
                                <Button asChild className="flex-1">
                                    <Link href={editHref}>
                                        Edit
                                        <ArrowRight className="ml-1.5 size-3.5" />
                                    </Link>
                                </Button>
                            ) : null}
                            {canWrite ? (
                                <RowActions
                                    row={row}
                                    sellsOnline={sellsOnline}
                                    onStatus={onStatus}
                                    onDuplicate={onDuplicate}
                                    onDelete={onDelete}
                                />
                            ) : null}
                        </div>
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

/**
 * The footer's ⋯, in the row menu's order: Archive (or Publish, Sell
 * again) with its one true line, Duplicate, then Delete below a divider
 * (it confirms). Paused (#800): only taking it off sale is open, as in
 * the Editor; never Publish.
 */
function RowActions({
    row,
    sellsOnline,
    onStatus,
    onDuplicate,
    onDelete,
}: {
    row: CatalogueRow;
    sellsOnline: SellsOnline;
    onStatus: (row: CatalogueRow, status: ProductStatus) => void;
    onDuplicate: (row: CatalogueRow) => void;
    onDelete: (row: CatalogueRow) => void;
}) {
    const selling = row.status === "PUBLISHED";
    const canSell = !row.paused || selling;
    const label = selling
        ? "Archive"
        : row.status === "ARCHIVED"
          ? "Sell again"
          : "Publish";
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton
                    label="More actions"
                    icon={<MoreHorizontal />}
                    variant="outline"
                    size="md"
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-64">
                {canSell ? (
                    <DropdownMenuItem
                        className="items-start"
                        onSelect={() =>
                            onStatus(row, selling ? "ARCHIVED" : "PUBLISHED")
                        }
                    >
                        {selling ? <Archive /> : <Check />}
                        <span className="flex flex-col gap-0.5">
                            <span>{label}</span>
                            <span className="text-pretty text-[12px] leading-[1.4] text-muted-foreground">
                                {sellLine(selling, sellsOnline)}
                            </span>
                        </span>
                    </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => onDuplicate(row)}>
                    <Copy />
                    Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onDelete(row)}
                >
                    <Trash2 />
                    Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/** A thumb, not a mouse: no keyboard hints like "(K)" in the names. */
function useCoarsePointer(): boolean {
    return useSyncExternalStore(
        (on) => {
            if (typeof window === "undefined") return () => undefined;
            const media = window.matchMedia("(pointer: coarse)");
            media.addEventListener("change", on);
            return () => media.removeEventListener("change", on);
        },
        () =>
            typeof window !== "undefined" &&
            window.matchMedia("(pointer: coarse)").matches,
        () => false,
    );
}

function PriceBlock({ row }: { row: CatalogueRow }) {
    const money = (v: string) => formatMoneyMajor(v, row.currency);
    return (
        <div className="min-w-0">
            <div className="font-display text-[14px] font-semibold tabular-nums tracking-[-0.02em]">
                {row.priceRange
                    ? `${money(row.priceRange.low)} to ${money(row.priceRange.high)}`
                    : money(row.price)}
            </div>
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
