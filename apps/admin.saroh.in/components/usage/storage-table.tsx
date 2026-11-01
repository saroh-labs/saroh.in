"use client";

import { buttonVariants } from "@saroh/ui/button";
import type { DataColumn } from "@saroh/ui/data-view";
import { DataView } from "@saroh/ui/data-view";
import Link from "next/link";

import { LifecycleBadge } from "@/components/business/lifecycle-badge";
import { plural } from "@/lib/format";
import type { StorageOrder, StorageUsageRow } from "@/lib/usage-words";
import { formatLimit, formatStorage, usageHref } from "@/lib/usage-words";

/*
 * No column sorts here: the order is the server's, across every business
 * (Most / Least / Closest to limit above the table). Sorting one page in
 * the browser would read as a sort of the whole list.
 */
const COLUMNS: DataColumn<StorageUsageRow>[] = [
    {
        id: "name",
        header: "Business",
        priority: "primary",
        cell: (row) => (
            <div className="min-w-0">
                <p className="truncate font-medium">{row.name}</p>
                <p className="truncate font-mono text-[12px] text-muted-foreground">
                    {row.slug}
                </p>
            </div>
        ),
    },
    {
        id: "state",
        header: "State",
        priority: "secondary",
        width: "150px",
        cell: (row) => <LifecycleBadge status={row.lifecycleStatus} />,
    },
    {
        id: "files",
        header: "Files",
        priority: "detail",
        width: "100px",
        numeric: true,
        cell: (row) => row.files.toLocaleString("en-IN"),
    },
    {
        id: "storage",
        header: "Storage used",
        priority: "primary",
        width: "140px",
        numeric: true,
        cell: (row) => formatStorage(row.bytes),
    },
    {
        id: "limit",
        header: "Plan limit",
        priority: "detail",
        width: "120px",
        numeric: true,
        cell: (row) => formatLimit(row.limitGb),
    },
    {
        id: "used",
        header: "Used",
        priority: "secondary",
        width: "90px",
        numeric: true,
        cell: (row) =>
            row.usedPercent === null ? (
                <span className="text-muted-foreground">—</span>
            ) : (
                `${row.usedPercent}%`
            ),
    },
];

/** One page of businesses by the storage their photos and videos use. */
export function StorageTable({
    rows,
    order,
    pages,
}: {
    rows: StorageUsageRow[];
    order: StorageOrder;
    pages: number;
}) {
    return (
        <DataView
            viewId="console-usage-storage"
            rows={rows}
            columns={COLUMNS}
            rowKey={(row) => row.id}
            rowHref={(row) => `/businesses/${row.id}`}
            modes={["table", "list"]}
            noun={{ one: "business", other: "businesses" }}
            countLabel={(visible) =>
                `${plural(visible, "business", "businesses")} on this page`
            }
            emptyState={{
                title: "No businesses on this page",
                note: `There ${pages === 1 ? "is only 1 page" : `are only ${pages} pages`}.`,
                action: (
                    <Link
                        href={usageHref(order, 1)}
                        className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                        })}
                    >
                        Go to page 1
                    </Link>
                ),
            }}
        />
    );
}
