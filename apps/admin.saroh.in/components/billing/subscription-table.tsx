"use client";

import { Badge } from "@saroh/ui/badge";
import type { DataColumn } from "@saroh/ui/data-view";
import { DataView } from "@saroh/ui/data-view";

import type { SarohSubscriptionRow } from "@/lib/billing-words";
import {
    autopayState,
    billedToLine,
    cycleLabel,
    formatPaise,
    istDate,
    nextChargeLine,
    planNote,
    statusLabel,
} from "@/lib/billing-words";
import { plural } from "@/lib/format";

/** A state pill's tone; the state is always said in words too. */
export const STATUS_TONE: Record<
    string,
    "success" | "info" | "error" | "neutral"
> = {
    ACTIVE: "success",
    TRIALING: "info",
    PAST_DUE: "error",
    CANCELLED: "neutral",
};

/** A quiet second line under a cell's first. */
const SUB = "truncate text-[12px] text-muted-foreground";

const COLUMNS: DataColumn<SarohSubscriptionRow>[] = [
    {
        id: "business",
        header: "Business",
        priority: "primary",
        cell: (row) => (
            <div className="min-w-0">
                <p className="truncate font-medium">{row.organization.name}</p>
                <p className={SUB}>
                    {billedToLine(row) ?? (
                        <span className="font-mono">
                            {row.organization.slug}
                        </span>
                    )}
                </p>
            </div>
        ),
    },
    {
        id: "plan",
        header: "Plan",
        priority: "primary",
        cell: (row) => {
            const note = planNote(row);
            return (
                <div className="min-w-0">
                    <p className="truncate">
                        {row.plan.name} · {cycleLabel(row.billingCycle)}
                    </p>
                    {note ? <p className={SUB}>{note}</p> : null}
                </div>
            );
        },
    },
    {
        id: "status",
        header: "Status",
        priority: "secondary",
        width: "140px",
        cell: (row) => (
            <Badge variant={STATUS_TONE[row.status] ?? "neutral"}>
                {statusLabel(row.status)}
            </Badge>
        ),
    },
    {
        id: "next",
        header: "Next charge",
        priority: "secondary",
        width: "220px",
        cell: (row) => <p className="truncate">{nextChargeLine(row)}</p>,
    },
    {
        id: "autopay",
        header: "Autopay",
        priority: "detail",
        width: "160px",
        cell: (row) => {
            const autopay = autopayState(row);
            return autopay.warn ? (
                <Badge variant="warning">{autopay.label}</Badge>
            ) : (
                <span className="text-muted-foreground">{autopay.label}</span>
            );
        },
    },
    {
        id: "last",
        header: "Last invoice",
        priority: "detail",
        width: "170px",
        cell: (row) =>
            row.lastInvoice ? (
                <div className="min-w-0">
                    <p className="truncate font-mono text-[12px]">
                        {row.lastInvoice.number}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                        {istDate(row.lastInvoice.issuedAt)} ·{" "}
                        {formatPaise(row.lastInvoice.totalPaise)}
                    </p>
                </div>
            ) : (
                <span className="text-muted-foreground">None</span>
            ),
    },
];

/** One page of subscriptions; a row opens its side sheet. */
export function SubscriptionTable({
    rows,
    openHref,
}: {
    rows: SarohSubscriptionRow[];
    /** This screen's address with the row's sheet open. */
    openHref: Record<string, string>;
}) {
    return (
        <DataView
            viewId="console-billing-subscriptions"
            rows={rows}
            columns={COLUMNS}
            rowKey={(row) => row.id}
            rowHref={(row) => openHref[row.id] ?? "#"}
            modes={["table", "list"]}
            noun={{ one: "subscription", other: "subscriptions" }}
            countLabel={(visible) =>
                `${plural(visible, "subscription")} on this page`
            }
            emptyState={{
                title: "No subscriptions on this page",
                note: "Go back to the first page.",
            }}
        />
    );
}
