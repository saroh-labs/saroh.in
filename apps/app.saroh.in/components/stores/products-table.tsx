"use client";

import { Badge } from "@saroh/ui/badge";
import type { ColumnDef } from "@saroh/ui/data-table";
import { DataTable } from "@saroh/ui/data-table";
import { useRouter } from "next/navigation";

import type { Product } from "@/lib/products/service";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
    PUBLISHED: "default",
    DRAFT: "secondary",
    ARCHIVED: "outline",
};

/** Display a decimal-string price with 2 places (display only; value is exact). */
function formatPrice(price: string): string {
    const n = Number(price);
    return Number.isFinite(n) ? n.toFixed(2) : price;
}

const columns: ColumnDef<Product>[] = [
    {
        accessorKey: "name",
        header: "Product",
        cell: ({ row }) => (
            <span className="font-medium">{row.original.name}</span>
        ),
    },
    {
        id: "category",
        accessorFn: (p) => p.category?.name ?? "",
        header: "Category",
        cell: ({ row }) => (
            <span className="text-muted-foreground">
                {row.original.category?.name ?? "Uncategorized"}
            </span>
        ),
    },
    {
        id: "price",
        accessorFn: (p) => Number(p.price) || 0,
        header: "Price",
        cell: ({ row }) => (
            <span className="tabular-nums">
                {row.original.currency} {formatPrice(row.original.price)}
            </span>
        ),
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
            <Badge variant={STATUS_VARIANT[row.original.status] ?? "secondary"}>
                {row.original.status}
            </Badge>
        ),
    },
];

/** Sortable, clickable products table. Rows link to the product editor. */
export function ProductsTable({
    products,
    base,
}: {
    products: Product[];
    base: string;
}) {
    const router = useRouter();
    return (
        <DataTable
            columns={columns}
            data={products}
            onRowClick={(p) => router.push(`${base}/${p.id}`)}
        />
    );
}
