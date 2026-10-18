"use client";

import { Badge } from "@saroh/ui/badge";
import type { DataColumn } from "@saroh/ui/data-view";
import { DataView } from "@saroh/ui/data-view";
import Link from "next/link";

import type { ProviderEventRow } from "@/lib/billing-action-words";
import { refLabel } from "@/lib/billing-action-words";
import type { EventHandled } from "@/lib/billing-event-words";
import {
    eventHandled,
    eventWords,
    HANDLED_LABEL,
} from "@/lib/billing-event-words";
import { istDateTime } from "@/lib/billing-words";
import { plural } from "@/lib/format";

import { businessBillingHref } from "./action-list";
import { RefList } from "./razorpay-id";

const HANDLED_TONE: Record<EventHandled, "success" | "warning" | "neutral"> = {
    handled: "success",
    "not-applied": "warning",
    "no-business": "warning",
};

/*
 * No column sorts: the order is the API's, newest first across every
 * business, and a page sorted in the browser would read as the whole list.
 */
const columns: DataColumn<ProviderEventRow>[] = [
    {
        id: "when",
        header: "When",
        priority: "secondary",
        width: "170px",
        cell: (e) => (
            <span className="text-[13px] text-muted-foreground">
                {istDateTime(e.receivedAt)}
            </span>
        ),
    },
    {
        id: "means",
        header: "What it means",
        priority: "primary",
        cell: (e) => (
            <div className="grid min-w-0 gap-0.5">
                <p className="font-medium">{eventWords(e.type)}</p>
                {/* The provider's own name for it, and its id. */}
                <p className="break-all font-mono text-[12px] text-muted-foreground">
                    {e.type} · {e.provider} · {e.providerEventId}
                </p>
                <RefList
                    refs={{ ...e.refs, provider: e.provider }}
                    labelOf={refLabel}
                />
            </div>
        ),
    },
    {
        id: "business",
        header: "Business",
        priority: "primary",
        width: "200px",
        cell: (e) =>
            e.organization ? (
                <Link
                    href={businessBillingHref(e.organization.slug)}
                    className="block truncate font-medium underline-offset-4 hover:underline"
                >
                    {e.organization.name}
                </Link>
            ) : (
                <span className="text-muted-foreground">No business</span>
            ),
    },
    {
        id: "handled",
        header: "Handled",
        priority: "primary",
        width: "130px",
        cell: (e) => {
            const handled = eventHandled(e);
            return (
                <Badge variant={HANDLED_TONE[handled]} size="sm">
                    {HANDLED_LABEL[handled]}
                </Badge>
            );
        },
    },
];

/**
 * What Saroh's billing provider sent (R28), a page of it: each event in
 * words with the provider's own name for it below, the business it was
 * for, and whether Saroh handled it. Never the payload: the API never
 * sends it.
 */
export function ProviderEvents({ rows }: { rows: ProviderEventRow[] }) {
    return (
        <DataView
            viewId="console-billing-events"
            rows={rows}
            columns={columns}
            rowKey={(e) => e.id}
            modes={["table", "list"]}
            noun={{ one: "event", other: "events" }}
            countLabel={(visible) => `${plural(visible, "event")} on this page`}
            emptyState={{
                title: "No events on this page",
                note: "Go back to the first page.",
            }}
        />
    );
}
