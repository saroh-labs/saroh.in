"use client";

import type { DataColumn } from "@saroh/ui/data-view";
import { DataView } from "@saroh/ui/data-view";

import { LifecycleBadge } from "@/components/business/lifecycle-badge";
import { plural } from "@/lib/format";
import type { StorageUsageRow } from "@/lib/usage-words";
import { formatGb } from "@/lib/usage-words";

/*
 * No column sorts here: the order is the server's, across every business
 * (Most / Least above the table). Sorting one page in the browser would
 * read as a sort of the whole list.
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
        cell: (row) => formatGb(row.gb),
    },
];

/** One page of businesses by the storage their photos and videos use. */
export function StorageTable({ rows }: { rows: StorageUsageRow[] }) {
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
                note: "Go back to the first page.",
            }}
        />
    );
}
