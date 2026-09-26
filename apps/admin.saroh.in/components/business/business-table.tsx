"use client";

import { Badge } from "@saroh/ui/badge";
import type { DataColumn } from "@saroh/ui/data-view";
import { DataView } from "@saroh/ui/data-view";

import type { BusinessRow } from "@/lib/businesses";
import { formatRelative, plural } from "@/lib/format";
import { moduleLabel } from "@/lib/modules";

import { ATTENTION_LABEL, LifecycleBadge } from "./lifecycle-badge";

const COLUMNS: DataColumn<BusinessRow>[] = [
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
        priority: "primary",
        width: "150px",
        cell: (row) => (
            <div className="flex flex-wrap gap-1">
                <LifecycleBadge status={row.lifecycleStatus} />
                {row.attention.map((reason) => (
                    <Badge key={reason} variant="warning">
                        {ATTENTION_LABEL[reason]}
                    </Badge>
                ))}
            </div>
        ),
    },
    {
        id: "plan",
        header: "Plan",
        priority: "secondary",
        width: "130px",
        cell: (row) =>
            row.plan ? (
                <span>
                    {row.plan.name}
                    {row.subscriptionStatus === "TRIALING" && (
                        <span className="text-muted-foreground"> · trial</span>
                    )}
                </span>
            ) : (
                <span className="text-muted-foreground">No plan</span>
            ),
    },
    {
        id: "modules",
        header: "Modules",
        priority: "secondary",
        cell: (row) =>
            row.enabledModules.length === 0 ? (
                <span className="text-muted-foreground">None</span>
            ) : (
                <span className="line-clamp-2">
                    {row.enabledModules.map(moduleLabel).join(", ")}
                </span>
            ),
    },
    {
        id: "people",
        header: "People",
        priority: "detail",
        width: "90px",
        numeric: true,
        cell: (row) => row.members,
    },
    {
        id: "lastActive",
        header: "Last active",
        priority: "detail",
        width: "130px",
        cell: (row) => formatRelative(row.lastActiveAt),
    },
];

/**
 * The directory's rows. Searching and paging are the server's — the query
 * string drives them — so this table only lays out the page it is given.
 */
export function BusinessTable({ rows }: { rows: BusinessRow[] }) {
    return (
        <DataView
            viewId="console-businesses"
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
                title: "No business matches",
                note: "Change the search or clear the filters.",
            }}
        />
    );
}
