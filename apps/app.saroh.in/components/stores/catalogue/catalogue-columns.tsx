"use client";

import { count } from "@/lib/format/plural";
import { Badge } from "@saroh/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IntentLink } from "@saroh/ui/intent-link";
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
import { Fragment } from "react";

import type { DataColumn } from "@/components/shared/data-view/types";
import { formatMoneyMajor } from "@/lib/format/money";
import { rowRating } from "@/lib/product-reviews/describe";
import type { ProductRating } from "@/lib/product-reviews/service";
import type { CatalogueRow } from "@/lib/products/catalogue";
import { rowFacts, stockWhere, stockWords } from "@/lib/products/catalogue";
import type { NeedDetail } from "@/lib/products/needs-you";

import { IconButton } from "@saroh/ui/icon-button";
import { ProductThumb } from "./product-thumb";
import { STATUS_LABEL, STATUS_VARIANT, TONE_TEXT } from "./tones";

/**
 * The product's state beside its name, only when it isn't plainly on sale
 * (owner, 15 Nov; HPProductsStatesDesk): Draft, Archived, or Paused by your
 * plan. A live product says nothing; there is no Status column of 51
 * "Live" pills.
 */
function StatusPill({ row }: { row: CatalogueRow }) {
    // Past the plan's limit (#800): hidden from the site, so its status
    // there is not what the list would otherwise say. The notice above
    // the list says why, in words.
    if (row.paused) {
        return (
            <Badge
                variant="error"
                size="sm"
                className="shrink-0"
                title="Hidden from your site and read-only: past your plan's products limit"
            >
                Paused by your plan
            </Badge>
        );
    }
    if (row.status === "PUBLISHED") return null;
    return (
        <Badge
            variant={STATUS_VARIANT[row.status]}
            size="sm"
            className="shrink-0"
        >
            {STATUS_LABEL[row.status]}
        </Badge>
    );
}

/** The row's price: the variants' range when they differ. */
export function priceText(row: CatalogueRow): string {
    const money = (v: string) => formatMoneyMajor(v, row.currency);
    return row.priceRange
        ? `${money(row.priceRange.low)} to ${money(row.priceRange.high)}`
        : money(row.price);
}

/**
 * The table's columns, as the polished design lays them out
 * (HPProductsDesk): Product (tile, name with a pill only when it isn't
 * live, variants · SKU), Category, Stock (what can be sold, then where),
 * Price. The headers don't sort: the list's own Sort reads the whole
 * catalogue in that order (`?sort=`), never one page on its own.
 */
export function catalogueColumns({
    ratingById,
    needById = new Map(),
    sold,
}: {
    ratingById: Map<string, ProductRating>;
    /** What Needs you says about each product: the Stock cell agrees. */
    needById?: Map<string, NeedDetail>;
    /**
     * Each product's last 30 days (finding 17); undefined for a role the
     * API sends no sales to, and the column isn't drawn.
     */
    sold?: Partial<Record<string, { units: number; amount: string }>>;
}): DataColumn<CatalogueRow>[] {
    const soldColumn: DataColumn<CatalogueRow>[] = sold
        ? [
              {
                  id: "sold",
                  header: "Sold, 30 days",
                  priority: "detail",
                  width: "150px",
                  numeric: true,
                  tableClassName: "hidden min-[900px]:table-cell",
                  cell: (r) => {
                      const s = sold[r.id];
                      return s ? (
                          <span className="whitespace-nowrap tabular-nums">
                              <span className="font-semibold">{s.units}</span>
                              {" · "}
                              {formatMoneyMajor(s.amount, r.currency)}
                          </span>
                      ) : (
                          <span
                              data-ph-unmask=""
                              className="text-muted-foreground"
                          >
                              None
                          </span>
                      );
                  },
              },
          ]
        : [];
    return [
        {
            id: "product",
            header: "Product",
            priority: "primary",
            cell: (r) => (
                <span className="flex min-w-0 items-center gap-3">
                    <ProductThumb name={r.name} image={r.image} />
                    <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[14px] font-semibold">
                                {r.name}
                            </span>
                            <StatusPill row={r} />
                        </span>
                        {(() => {
                            // Where it sells moved under Stock ("across 2
                            // locations", HPProductsNotes); a narrowed or
                            // one-place list never needed it.
                            const facts = rowFacts(r, false);
                            const rating = rowRating([r.id], ratingById);
                            const parts = [
                                facts.variants,
                                facts.sku ? (
                                    <span key="sku">{facts.sku}</span>
                                ) : null,
                                rating ? (
                                    <span
                                        key="rating"
                                        aria-label={`Rated ${rating.average} from ${count(rating.count, "review")}`}
                                    >
                                        ★ {rating.average.toFixed(1)} (
                                        {rating.count})
                                    </span>
                                ) : null,
                            ].filter((p) => p !== null);
                            return parts.length > 0 ? (
                                <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
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
            id: "category",
            header: "Category",
            // A desk's column; a phone's card leaves it out (HPProductsPhone).
            priority: "detail",
            width: "200px",
            tableClassName: "hidden min-[1100px]:table-cell",
            cell: (r) => (
                <span className="text-[13.5px] text-neutral-700 dark:text-muted-foreground">
                    {r.categoryName ?? "Uncategorized"}
                </span>
            ),
        },
        {
            id: "inventory",
            header: "Stock",
            priority: "secondary",
            // A phone's card: on the right, under the price (HPProductsPhone).
            listPlace: "end",
            width: "164px",
            numeric: true,
            cell: (r) => {
                const s = stockWords(r, needById.get(r.id) ?? null);
                const where = stockWhere(r, s);
                return (
                    <span className="grid justify-items-end text-right">
                        <span
                            className={cn(
                                "text-balance text-[13.5px] font-semibold",
                                s.tone === "plain"
                                    ? "text-foreground"
                                    : TONE_TEXT[s.tone],
                            )}
                        >
                            {s.text}
                        </span>
                        {where ? (
                            // A phone's card says the figure alone.
                            <span className="hidden text-[12.5px] font-normal text-muted-foreground sm:block">
                                {where}
                            </span>
                        ) : null}
                    </span>
                );
            },
        },
        {
            id: "price",
            header: "Price",
            priority: "secondary",
            listPlace: "end",
            width: "132px",
            numeric: true,
            money: true,
            cell: (r) => (
                <span className="whitespace-nowrap tracking-[-0.02em]">
                    {priceText(r)}
                </span>
            ),
        },
        ...soldColumn,
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
                <IconButton
                    label={`More actions for ${row.name}`}
                    icon={<MoreHorizontal />}
                    variant="ghost"
                    className="text-muted-foreground"
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={onPreview}>
                    <Package />
                    Preview
                </DropdownMenuItem>
                {canWrite || canStock ? (
                    <DropdownMenuItem asChild>
                        <IntentLink href={editHref}>
                            <Pencil />
                            Edit
                        </IntentLink>
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
