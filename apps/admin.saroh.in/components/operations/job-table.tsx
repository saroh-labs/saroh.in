"use client";

import { Badge } from "@saroh/ui/badge";
import type { DataColumn } from "@saroh/ui/data-view";
import { DataView } from "@saroh/ui/data-view";

import { formatDateTime, formatRelative } from "@/lib/format";
import type { JobRow } from "@/lib/machinery";

import { BulkAction } from "./bulk-action";

const STATUS: Record<
    JobRow["status"],
    { label: string; variant: "success" | "info" | "error" | "neutral" }
> = {
    PENDING: { label: "Waiting", variant: "neutral" },
    PROCESSING: { label: "Running", variant: "info" },
    DONE: { label: "Done", variant: "success" },
    FAILED: { label: "Failed", variant: "error" },
};

const COLUMNS: DataColumn<JobRow>[] = [
    {
        id: "type",
        header: "Job",
        priority: "primary",
        cell: (row) => (
            <div className="min-w-0">
                <p className="truncate font-mono text-[13px]">{row.type}</p>
                <p className="truncate text-[13px] text-muted-foreground">
                    {row.organization?.name ?? "The instance"}
                </p>
            </div>
        ),
    },
    {
        id: "status",
        header: "State",
        priority: "primary",
        width: "110px",
        cell: (row) => (
            <Badge variant={STATUS[row.status].variant}>
                {STATUS[row.status].label}
            </Badge>
        ),
    },
    {
        id: "attempts",
        header: "Tries",
        priority: "secondary",
        width: "80px",
        numeric: true,
        cell: (row) => `${row.attempts}/${row.maxAttempts}`,
    },
    {
        id: "error",
        header: "Last error",
        priority: "secondary",
        cell: (row) =>
            row.lastError ? (
                <span className="line-clamp-2 break-words text-[13px]">
                    {row.lastError}
                </span>
            ) : (
                <span className="text-muted-foreground">—</span>
            ),
    },
    {
        id: "when",
        header: "When",
        priority: "detail",
        width: "140px",
        cell: (row) => (
            <span title={formatDateTime(row.updatedAt)}>
                {row.status === "PENDING"
                    ? `due ${formatRelative(row.runAt)}`
                    : formatRelative(row.updatedAt)}
            </span>
        ),
    },
];

/** Jobs on the queue. A failed one can be retried, always through a dry run. */
export function JobTable({
    rows,
    canRetry,
}: {
    rows: JobRow[];
    canRetry: boolean;
}) {
    return (
        <DataView
            viewId="console-jobs"
            rows={rows}
            columns={COLUMNS}
            rowKey={(row) => row.id}
            modes={["table", "list"]}
            noun={{ one: "job", other: "jobs" }}
            rowActions={
                canRetry
                    ? (row) =>
                          row.status === "FAILED" ? (
                              <BulkAction
                                  kind="jobs.retry"
                                  ids={[row.id]}
                                  trigger="Retry"
                                  triggerVariant="ghost"
                                  noun={{ one: "job", other: "jobs" }}
                              />
                          ) : null
                    : undefined
            }
            emptyState={{
                title: "No job matches",
                note: "Nothing on the queue fits these filters.",
            }}
        />
    );
}
