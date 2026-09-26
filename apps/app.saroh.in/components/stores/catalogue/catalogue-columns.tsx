"use client";

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
    Archive,
    Check,
    Copy,
    MoreHorizontal,
    Package,
    Pencil,
    Trash2,
} from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

import type { DataColumn } from "@/components/shared/data-view/types";
import { formatMoneyMajor } from "@/lib/format/money";
import { ratingLabel, rowRating } from "@/lib/product-reviews/describe";
import type { ProductRating } from "@/lib/product-reviews/service";
import type { CatalogueRow } from "@/lib/products/catalogue";
import { rowFacts, stockWords } from "@/lib/products/catalogue";

import { ProductThumb } from "./product-thumb";
import { STATUS_LABEL, STATUS_VARIANT, TONE_TEXT } from "./tones";

/** The row's price: the variants' range when they differ. */
export function priceText(row: CatalogueRow): string {
    const money = (v: string) => formatMoneyMajor(v, row.currency) ?? "—";
    return row.priceRange
        ? `${money(row.priceRange.low)} – ${money(row.priceRange.high)}`
        : money(row.price);
}

/**
 * The table's columns, as the design lays them out: Product (tile, name,
 * variants · SKU · where it sells), Status, Inventory, Price. Not sortable:
 * a page of the catalogue sorted on its own would be a lie about the rest.
 */
export function catalogueColumns({
    many,
    filtered,
    ratingById,
}: {
    /** More than one storefront: rows say where they sell. */
    many: boolean;
    /** Narrowed to one storefront: rows needn't say. */
    filtered: boolean;
    ratingById: Map<string, ProductRating>;
}): DataColumn<CatalogueRow>[] {
    return [
        {
            id: "product",
            header: "Product",
            priority: "primary",
            cell: (r) => (
                <span className="flex min-w-0 items-center gap-[11px]">
                    <ProductThumb name={r.name} image={r.image} />
                    <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium">
                            {r.name}
                        </span>
                        {(() => {
                            // An aggregate view must say which places a row
                            // belongs to; no variants, no "0 variants".
                            const facts = rowFacts(r, !filtered && many);
                            const rating = rowRating([r.id], ratingById);
                            const parts = [
                                facts.variants,
                                facts.sku ? (
                                    <span key="sku" className="font-mono">
                                        {facts.sku}
                                    </span>
                                ) : null,
                                facts.places,
                                rating ? (
                                    <span
                                        key="rating"
                                        aria-label={`Rated ${rating.average} from ${rating.count} ${rating.count === 1 ? "review" : "reviews"}`}
                                    >
                                        ★ {ratingLabel(rating)}
                                    </span>
                                ) : null,
                            ].filter((p) => p !== null);
                            return parts.length > 0 ? (
                                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                    {parts.map((p, i) => (
                                        <Fragment key={i}>
                                            {i > 0 ? " · " : null}
                                            {p}
                                        </Fragment>
                                    ))}
                                </span>
                            ) : null;
                        })()}
                    </span>
                </span>
            ),
        },
        {
            id: "status",
            header: "Status",
            priority: "secondary",
            width: "118px",
            cell: (r) => (
                <Badge
                    variant={STATUS_VARIANT[r.status]}
                    className="px-[9px] py-[3px] text-[11px] font-medium"
                >
                    {STATUS_LABEL[r.status]}
                </Badge>
            ),
        },
        {
            id: "inventory",
            header: "Inventory",
            priority: "secondary",
            width: "128px",
            cell: (r) => {
                const s = stockWords(r);
                return (
                    <span
                        className={cn(
                            "whitespace-nowrap text-[12.5px]",
                            TONE_TEXT[s.tone],
                        )}
                    >
                        {s.text}
                    </span>
                );
            },
        },
        {
            id: "price",
            header: "Price",
            priority: "secondary",
            width: "132px",
            numeric: true,
            money: true,
            cell: (r) => (
                <span className="whitespace-nowrap tracking-[-0.02em]">
                    {priceText(r)}
                </span>
            ),
        },
    ];
}

/**
 * A row's menu (the design): Preview · Edit · Duplicate · Archive ·
 * Delete, below a divider and confirmed. What a role can't do isn't
 * offered; the API refuses it anyway.
 */
export function RowMenu({
    row,
    editHref,
    canWrite,
    canStock,
    onPreview,
    onDuplicate,
    onStatus,
    onDelete,
}: {
    row: CatalogueRow;
    editHref: string;
    canWrite: boolean;
    canStock: boolean;
    onPreview: () => void;
    onDuplicate: () => void;
    onStatus: (status: "PUBLISHED" | "ARCHIVED") => void;
    onDelete: () => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground coarse:size-11"
                    aria-label={`More actions for ${row.name}`}
                >
                    <MoreHorizontal className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={onPreview}>
                    <Package />
                    Preview
                </DropdownMenuItem>
                {canWrite || canStock ? (
                    <DropdownMenuItem asChild>
                        <Link href={editHref}>
                            <Pencil />
                            Edit
                        </Link>
                    </DropdownMenuItem>
                ) : null}
                {canWrite ? (
                    <>
                        <DropdownMenuItem onSelect={onDuplicate}>
                            <Copy />
                            Duplicate
                        </DropdownMenuItem>
                        {row.status === "PUBLISHED" ? (
                            <DropdownMenuItem
                                onSelect={() => onStatus("ARCHIVED")}
                            >
                                <Archive />
                                Archive
                            </DropdownMenuItem>
                        ) : (
                            <DropdownMenuItem
                                onSelect={() => onStatus("PUBLISHED")}
                            >
                                <Check />
                                {row.status === "ARCHIVED"
                                    ? "Sell again"
                                    : "Publish"}
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            variant="destructive"
                            onSelect={onDelete}
                        >
                            <Trash2 />
                            Delete
                        </DropdownMenuItem>
                    </>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
