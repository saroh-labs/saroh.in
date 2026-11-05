"use client";

import { Badge } from "@saroh/ui/badge";
import type { DataColumn } from "@saroh/ui/data-view";
import { DataView } from "@saroh/ui/data-view";
import type { MouseEvent } from "react";

import type { BusinessRow } from "@/lib/businesses";
import { formatRelative } from "@/lib/format";
import { moduleLabel } from "@/lib/modules";
import { planNote } from "@/lib/plan-words";
import { SERVER_PAGED } from "@/lib/server-paged";

import {
    attentionLabel,
    LegalHoldBadge,
    LifecycleBadge,
} from "./lifecycle-badge";

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
                {row.legalHold && <LegalHoldBadge />}
                {row.attention.map((reason) => (
                    <Badge key={reason} variant="warning">
                        {attentionLabel(reason, row.lastActiveAt)}
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
        cell: (row) => <PlanCell row={row} />,
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
 * The plan it is on now (UX-087): an override's plan, with when it ends and
 * the plan underneath on a second line. Off the catalogue, its own row.
 */
function PlanCell({ row }: { row: BusinessRow }) {
    const effective = row.effectivePlan ?? null;
    const name = effective?.name ?? row.plan?.name;
    if (!name) return <span className="text-muted-foreground">No plan</span>;
    const note = effective ? planNote(effective) : null;
    return (
        <span>
            {name}
            {row.subscriptionStatus === "TRIALING" && (
                <span className="text-muted-foreground"> · trial</span>
            )}
            {note && (
                <span className="block text-[12.5px] text-muted-foreground">
                    {note}
                </span>
            )}
        </span>
    );
}

/**
 * A click anywhere on a table row opens the business, as its name does
 * (admin audit F2). The name stays the row's one link, so keyboard and
 * screen-reader users reach it as before; a click on any other link or
 * control in the row, a modified click, or a click that ends a text
 * selection is left alone.
 */
function openRow(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
    const target = event.target as Element;
    if (target.closest("a, button, input, select, textarea, label")) return;
    if (window.getSelection()?.toString()) return;
    target
        .closest("tbody tr")
        ?.querySelector<HTMLAnchorElement>("a[href]")
        ?.click();
}

/**
 * The directory's rows. Searching and paging are the server's — the query
 * string drives them — so this table only lays out the page it is given.
 */
export function BusinessTable({
    rows,
    range,
}: {
    rows: BusinessRow[];
    /** Which of the directory these are: "Showing 1–25". */
    range: string;
}) {
    return (
        // Delegated, not a handler per row: DataView draws the rows. The
        // keyboard's way in is the name's link, so no key handler here.
        <div onClick={openRow} className="[&_tbody_tr]:cursor-pointer">
            <DataView
                viewId="console-businesses"
                rows={rows}
                columns={COLUMNS}
                rowKey={(row) => row.id}
                rowHref={(row) => `/businesses/${row.id}`}
                modes={["table", "list"]}
                noun={{ one: "business", other: "businesses" }}
                countLabel={() => range}
                paging={SERVER_PAGED}
                emptyState={{
                    title: "No business matches",
                    note: "Change the search or clear the filters.",
                }}
            />
        </div>
    );
}
