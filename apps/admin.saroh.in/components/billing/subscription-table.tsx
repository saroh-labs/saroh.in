"use client";

import { Badge } from "@saroh/ui/badge";
import type { DataColumn } from "@saroh/ui/data-view";
import { DataView } from "@saroh/ui/data-view";

import type { SarohSubscriptionRow } from "@/lib/billing-words";
import {
    cycleLabel,
    endingLine,
    istDate,
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

const COLUMNS: DataColumn<SarohSubscriptionRow>[] = [
    {
        id: "business",
        header: "Business",
        priority: "primary",
        cell: (row) => (
            <div className="min-w-0">
                <p className="truncate font-medium">{row.organization.name}</p>
                <p className="truncate font-mono text-[12px] text-muted-foreground">
                    {row.organization.slug}
                </p>
            </div>
        ),
    },
    {
        id: "plan",
        header: "Plan",
        priority: "primary",
        cell: (row) => (
            <div className="min-w-0">
                <p className="truncate">
                    {row.plan.name} · {cycleLabel(row.billingCycle)}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">
                    Version {row.plan.version}
                </p>
            </div>
        ),
    },
    {
        id: "status",
        header: "Status",
        priority: "secondary",
        width: "150px",
        cell: (row) => (
            <Badge variant={STATUS_TONE[row.status] ?? "neutral"}>
                {statusLabel(row.status)}
            </Badge>
        ),
    },
    {
        id: "period",
        header: "Paid until",
        priority: "secondary",
        width: "200px",
        cell: (row) => {
            const ending = endingLine(row);
            return (
                <div className="min-w-0">
                    <p>{istDate(row.currentPeriodEnd)}</p>
                    {ending ? (
                        <p className="truncate text-[12px] text-muted-foreground">
                            {ending}
                        </p>
                    ) : null}
                </div>
            );
        },
    },
    {
        id: "autopay",
        header: "Autopay runs out",
        priority: "detail",
        width: "150px",
        cell: (row) =>
            row.termEndsAt ? (
                istDate(row.termEndsAt)
            ) : (
                <span className="text-muted-foreground">—</span>
            ),
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
                        {istDate(row.lastInvoice.issuedAt)}
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
