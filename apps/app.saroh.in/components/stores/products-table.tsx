"use client";

import { Badge } from "@saroh/ui/badge";
import { Card, CardContent } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { formatMoneyMajor } from "@/lib/format/money";
import type { Product } from "@/lib/products/service";

/**
 * The catalog, in whichever density suits the job.
 *
 * Products are the one dataset in the workspace where the grid earns its place:
 * a merchant checking prices wants the table, and a merchant checking that the
 * shop LOOKS right wants the pictures. Both are the same columns, so a product
 * cannot show a price in one and not the other.
 *
 * Status colour maps to tokens rather than badge variants, for the same reason
 * as Orders: `variant="default"` is `--primary`, the luminous action colour, so
 * a DRAFT product was competing with the page's actual call to action.
 */

const Missing = () => <span className="text-muted-foreground/60">—</span>;

const STATUS_CLASS: Record<string, string> = {
    PUBLISHED: "border border-brand/30 bg-brand/15 text-brand",
    DRAFT: "border border-warning/40 bg-warning-subtle text-warning-subtle-foreground",
    ARCHIVED: "border border-border bg-transparent text-muted-foreground",
};

const FILTERS: DataFilter<Product>[] = [
    { id: "all", label: "All" },
    { id: "live", label: "Live", predicate: (p) => p.status === "PUBLISHED" },
    { id: "draft", label: "Draft", predicate: (p) => p.status === "DRAFT" },
];

export function ProductsTable({
    products,
    base,
    initialView,
}: {
    products: Product[];
    base: string;
    initialView?: string;
}) {
    const columns: DataColumn<Product>[] = [
        {
            id: "name",
            header: "Product",
            priority: "primary",
            sortValue: (p) => p.name.toLowerCase(),
            cell: (p) => (
                <Link
                    href={`${base}/${p.id}`}
                    className="font-medium underline-offset-4 hover:text-brand hover:underline"
                >
                    {p.name}
                </Link>
            ),
        },
        {
            id: "category",
            header: "Category",
            priority: "secondary",
            sortValue: (p) => (p.category?.name ?? "").toLowerCase(),
            cell: (p) => (
                <span className="text-muted-foreground">
                    {p.category?.name ?? "Uncategorized"}
                </span>
            ),
        },
        {
            id: "price",
            header: "Price",
            priority: "secondary",
            numeric: true,
            sortValue: (p) => Number(p.price) || 0,
            cell: (p) => formatMoneyMajor(p.price, p.currency) ?? <Missing />,
        },
        {
            id: "status",
            header: "Status",
            priority: "secondary",
            sortValue: (p) => p.status,
            cell: (p) => (
                <Badge
                    className={cn(
                        "text-[0.625rem] font-medium uppercase tracking-wider",
                        STATUS_CLASS[p.status] ??
                            "border border-border bg-transparent text-muted-foreground",
                    )}
                >
                    {p.status}
                </Badge>
            ),
        },
    ];

    return (
        <DataView
            viewId="products"
            rows={products}
            columns={columns}
            rowKey={(p) => p.id}
            rowHref={(p) => `${base}/${p.id}`}
            modes={["table", "grid", "list"]}
            defaultMode="table"
            filters={FILTERS}
            initialFilterId={initialView}
            searchableColumnIds={["name", "category", "status"]}
            empty="Add your first product to start building the catalog."
            renderCard={(p) => (
                <Link href={`${base}/${p.id}`} className="block">
                    <Card className="h-full overflow-hidden transition-colors hover:border-brand/40">
                        {p.image ? (
                            <div className="aspect-[4/3] w-full bg-muted">
                                {/* A plain <img>, not next/image, on purpose:
                                    `images.domains` in next.config is an
                                    allowlist, and a merchant's product photo can
                                    be hosted anywhere. next/image THROWS on an
                                    unconfigured host, so one product with an
                                    off-list image would 500 the whole catalog.
                                    Lazy + async decoding keeps the cost close. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={p.image}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="size-full object-cover"
                                />
                            </div>
                        ) : (
                            // A labelled placeholder, not a blank box: "no image
                            // yet" is a thing to fix, and a silent grey rectangle
                            // reads as a failed load.
                            <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                                No image
                            </div>
                        )}
                        <CardContent className="space-y-1 p-4">
                            <p className="truncate font-medium">{p.name}</p>
                            <p className="text-sm tabular-nums text-muted-foreground">
                                {formatMoneyMajor(p.price, p.currency)}
                            </p>
                        </CardContent>
                    </Card>
                </Link>
            )}
        />
    );
}
