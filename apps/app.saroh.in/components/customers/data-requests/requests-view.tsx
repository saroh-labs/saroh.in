"use client";

import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

import {
    ListFilter,
    ListTable,
    listTable,
    ListTableHead,
    ListToolbar,
} from "@/components/shared/list-toolbar";
import { StatusBadge } from "@/components/shared/status-badge";
import { ViewerDate } from "@/components/shared/viewer-date";
import type {
    DataRequestRow,
    RequestFilter,
} from "@/lib/customer-workspace/data-requests-view";
import {
    emptyRequestsText,
    FILTER_LABEL,
    REQUEST_FILTERS,
    requesterLabel,
    requestsHref,
    requestSub,
    STATUS_WORDS,
} from "@/lib/customer-workspace/data-requests-view";

import { RequestSheet } from "./request-sheet";

const COLS = "sm:grid-cols-[minmax(0,2.2fr)_minmax(110px,1fr)_96px]";

/**
 * Sell › Customers › Requests (DEC-172, #1107): every customer's "Ask to
 * remove my data", newest first, read first as rows, with Open as the
 * starting filter. A row opens its side sheet, where the request is
 * finished: the existing removal, or closed with a reason.
 *
 * A read that failed says so with Try again, never an empty list
 * (saroh-product-states); none at all is its own empty state.
 */
export function RequestsView({
    heading,
    tabs,
    filter,
    rows,
    canRemove,
}: {
    heading: ReactNode;
    tabs: ReactNode;
    filter: RequestFilter;
    /** Null: the read failed. */
    rows: DataRequestRow[] | null;
    canRemove: boolean;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [openId, setOpenId] = useState<string | null>(null);
    const opened = rows?.find((r) => r.id === openId) ?? null;
    const go = (to: RequestFilter) =>
        start(() => router.replace(requestsHref(to), { scroll: false }));
    const refresh = () => start(() => router.refresh());

    return (
        <div>
            {heading}
            {tabs}
            <ListToolbar
                className="mb-3.5 mt-4"
                filters={
                    <ListFilter<RequestFilter>
                        label="Show"
                        value={filter}
                        // Open is where the list starts; it narrows nothing.
                        narrowed={filter !== "open"}
                        onValueChange={go}
                        options={REQUEST_FILTERS.map((f) => ({
                            value: f,
                            label: FILTER_LABEL[f],
                        }))}
                    />
                }
            />
            <div aria-busy={pending}>
                {rows === null ? (
                    <FailedState
                        data-ph-unmask=""
                        size="panel"
                        title={couldntLoad("requests")}
                        description="Nothing has changed. The requests are still there."
                        onRetry={refresh}
                    />
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={<ShieldCheck />}
                        {...emptyRequestsText(filter)}
                    />
                ) : (
                    <ListTable>
                        <ListTableHead
                            className={cn("hidden gap-3 sm:grid", COLS)}
                        >
                            <span>Customer</span>
                            <span>Asked</span>
                            <span>Status</span>
                        </ListTableHead>
                        <ul aria-label="Requests to remove data">
                            {rows.map((row) => (
                                <li key={row.id}>
                                    <Row
                                        row={row}
                                        onOpen={() => setOpenId(row.id)}
                                    />
                                </li>
                            ))}
                        </ul>
                    </ListTable>
                )}
            </div>
            <RequestSheet
                key={openId ?? "none"}
                request={opened}
                canRemove={canRemove}
                onClose={() => setOpenId(null)}
                onChanged={() => {
                    setOpenId(null);
                    refresh();
                }}
            />
        </div>
    );
}

function Row({ row, onOpen }: { row: DataRequestRow; onOpen: () => void }) {
    const status = STATUS_WORDS[row.status];
    const sub = requestSub(row);
    const who = requesterLabel(row);
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`${who}, asked to remove their data, ${status.label}`}
            className={cn(
                "grid w-full grid-cols-1 items-center gap-x-3 gap-y-1 text-left text-[13px] text-foreground",
                listTable.row,
                listTable.pressable,
                COLS,
            )}
        >
            <span className="grid min-w-0 gap-[3px]">
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span
                        data-ph-mask=""
                        className="min-w-0 truncate font-semibold"
                    >
                        {who}
                    </span>
                    {/* The phone's status, beside the name. */}
                    <span className="sm:hidden">
                        <StatusBadge tone={status.tone}>
                            {status.label}
                        </StatusBadge>
                    </span>
                </span>
                {sub ? (
                    <span
                        data-ph-mask=""
                        className="truncate text-[12px] text-muted-foreground"
                    >
                        {sub}
                    </span>
                ) : null}
                <span className="text-[12px] text-muted-foreground sm:hidden">
                    Asked <ViewerDate iso={row.askedAt} variant="recent" />
                </span>
            </span>
            <span className="hidden sm:block">
                <ViewerDate iso={row.askedAt} variant="recent" />
            </span>
            <span className="hidden sm:block">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </span>
        </button>
    );
}
