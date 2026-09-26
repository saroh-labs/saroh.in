"use client";

import type { BadgeProps } from "@saroh/ui/badge";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import { Plus, TicketPercent } from "lucide-react";
import Link from "next/link";

import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { ViewerDate } from "@/components/shared/viewer-date";
import { describeDiscount } from "@/lib/discounts/describe";
import type { Discount, DiscountState } from "@/lib/discounts/service";

/** The design's three pills. Exhausted is drawn as Expired: it will not work now. */
const STATE: Record<
    DiscountState,
    { label: string; variant: NonNullable<BadgeProps["variant"]> }
> = {
    ACTIVE: { label: "Active", variant: "success" },
    SCHEDULED: { label: "Scheduled", variant: "warning" },
    EXPIRED: { label: "Expired", variant: "neutral" },
    EXHAUSTED: { label: "Used up", variant: "neutral" },
};

const FILTERS: DataFilter<Discount>[] = [
    { id: "all", label: "All" },
    { id: "active", label: "Active", predicate: (d) => d.state === "ACTIVE" },
    {
        id: "scheduled",
        label: "Scheduled",
        predicate: (d) => d.state === "SCHEDULED",
    },
    {
        id: "ended",
        label: "Ended",
        predicate: (d) => d.state === "EXPIRED" || d.state === "EXHAUSTED",
    },
];

/**
 * Sell → Discounts, as the workspace design draws it: the code in mono with
 * what it does beneath, how often it has been used against its cap, when it
 * ends, and its state.
 *
 * A code belongs to the business; what it applies to — everything, some
 * storefronts, categories or products — is part of the code, not a scope
 * the screen follows.
 */
export function DiscountsScreen({
    discounts,
    canWrite,
}: {
    discounts: Discount[];
    canWrite: boolean;
}) {
    const columns: DataColumn<Discount>[] = [
        {
            id: "code",
            header: "Code",
            priority: "primary",
            sortValue: (d) => d.code,
            cell: (d) => (
                <span className="min-w-0">
                    <span className="block truncate font-mono text-[13.5px] font-medium">
                        {d.code}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                        {describeDiscount(d)}
                    </span>
                </span>
            ),
        },
        {
            id: "used",
            header: "Used",
            priority: "secondary",
            width: "112px",
            numeric: true,
            sortValue: (d) => d.used,
            cell: (d) => (
                <span className="tabular-nums">
                    {d.usageLimit === null
                        ? d.used
                        : `${d.used} of ${d.usageLimit}`}
                </span>
            ),
        },
        {
            id: "ends",
            header: "Ends",
            priority: "secondary",
            width: "150px",
            sortValue: (d) => d.endsAt ?? "9999",
            cell: (d) =>
                d.state === "SCHEDULED" && d.startsAt ? (
                    <span>
                        Starts <ViewerDate iso={d.startsAt} />
                    </span>
                ) : d.endsAt ? (
                    <span>
                        {d.state === "EXPIRED" ? "Ended " : "Ends "}
                        <ViewerDate iso={d.endsAt} />
                    </span>
                ) : (
                    <span className="text-muted-foreground">No end date</span>
                ),
        },
        {
            id: "state",
            header: "State",
            priority: "secondary",
            width: "112px",
            sortValue: (d) => d.state,
            cell: (d) => (
                <Badge variant={STATE[d.state].variant}>
                    {STATE[d.state].label}
                </Badge>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                breadcrumb={["Sell", "Discounts"]}
                title="Discounts"
                className="mb-0"
                actions={
                    canWrite ? (
                        <Button asChild>
                            <Link href="/commerce/discounts/new">
                                <Plus className="mr-1.5 size-4" />
                                New code
                            </Link>
                        </Button>
                    ) : undefined
                }
            />
            <DataView
                viewId="discounts"
                rows={discounts}
                columns={columns}
                rowKey={(d) => d.id}
                rowHref={(d) => `/commerce/discounts/${d.id}`}
                modes={["table", "list"]}
                hideModeToggle
                filters={FILTERS}
                noun={{ one: "code", other: "codes" }}
                searchPlaceholder="Search codes"
                searchableColumnIds={["code"]}
                emptyState={{
                    icon: <TicketPercent />,
                    title: "No discount codes yet",
                    note: "A code takes money off an order — from everything, or just the storefronts, categories or products you choose.",
                    action: canWrite ? (
                        <Button asChild>
                            <Link href="/commerce/discounts/new">
                                Make a code
                            </Link>
                        </Button>
                    ) : undefined,
                }}
            />
            <p className="max-w-[68ch] text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                An expired code keeps its figures — how often something was used
                is a fact about the past, not a setting.
            </p>
        </>
    );
}
