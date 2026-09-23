"use client";

import { Badge } from "@saroh/ui/badge";
import type { DataColumn } from "@saroh/ui/data-view";
import { DataView } from "@saroh/ui/data-view";

import { formatDateTime, formatRelative } from "@/lib/format";
import type { WebhookRow } from "@/lib/machinery";

import { BulkAction } from "./bulk-action";

const STATUS: Record<
    WebhookRow["status"],
    { label: string; variant: "success" | "info" | "error" | "neutral" }
> = {
    RECEIVED: { label: "Received", variant: "info" },
    PROCESSED: { label: "Applied", variant: "success" },
    IGNORED: { label: "Nothing to do", variant: "neutral" },
    FAILED: { label: "Failed", variant: "error" },
};

const COLUMNS: DataColumn<WebhookRow>[] = [
    {
        id: "event",
        header: "Delivery",
        priority: "primary",
        cell: (row) => (
            <div className="min-w-0">
                <p className="truncate font-mono text-[13px]">
                    {row.provider} · {row.eventType}
                </p>
                <p className="truncate text-[13px] text-muted-foreground">
                    {row.organization?.name ?? "No business"}
                </p>
            </div>
        ),
    },
    {
        id: "status",
        header: "State",
        priority: "primary",
        width: "130px",
        cell: (row) => (
            <Badge variant={STATUS[row.status].variant}>
                {STATUS[row.status].label}
            </Badge>
        ),
    },
    {
        id: "error",
        header: "Error",
        priority: "secondary",
        cell: (row) =>
            row.error ? (
                <span className="line-clamp-2 break-words text-[13px]">
                    {row.error}
                </span>
            ) : (
                <span className="text-muted-foreground">—</span>
            ),
    },
    {
        id: "received",
        header: "Received",
        priority: "detail",
        width: "130px",
        cell: (row) => (
            <span title={formatDateTime(row.createdAt)}>
                {formatRelative(row.createdAt)}
            </span>
        ),
    },
];

/** Webhook deliveries. A failed one can be replayed, always through a dry run. */
export function WebhookTable({
    rows,
    canReplay,
}: {
    rows: WebhookRow[];
    canReplay: boolean;
}) {
    return (
        <DataView
            viewId="console-webhooks"
            rows={rows}
            columns={COLUMNS}
            rowKey={(row) => row.id}
            modes={["table", "list"]}
            noun={{ one: "delivery", other: "deliveries" }}
            rowActions={
                canReplay
                    ? (row) =>
                          row.status === "FAILED" ? (
                              <BulkAction
                                  kind="webhooks.replay"
                                  ids={[row.id]}
                                  trigger="Replay"
                                  triggerVariant="ghost"
                                  noun={{
                                      one: "delivery",
                                      other: "deliveries",
                                  }}
                              />
                          ) : null
                    : undefined
            }
            emptyState={{
                title: "No delivery matches",
                note: "Nothing received fits these filters.",
            }}
        />
    );
}
