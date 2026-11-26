"use client";

import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";
import { countLabel, PageHeader } from "@saroh/ui/page-header";
import { TicketPercent } from "lucide-react";

import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import {
    FigureLoading,
    PageLoading,
} from "@/components/shared/page/page-loading";
import { describeDiscount, gaveOffOf } from "@/lib/discounts/describe";
import type { Discount } from "@/lib/discounts/service";

import { DiscountEnds } from "./discount-ends";

const FILTERS: DataFilter<Discount>[] = [
    { id: "all", label: "All" },
    { id: "active", label: "Live", predicate: (d) => d.state === "ACTIVE" },
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
 * what it does beneath, how often it has been used against its cap, what
 * it gave off (DEC-267), and when it runs, which says its state too
 * ("Ended 25 Nov", finding 26). A row opens the code, read first.
 *
 * A code belongs to the business; what it applies to — everything, some
 * storefronts, categories or products — is part of the code, not a scope
 * the screen follows.
 *
 * `discounts` undefined: still on its way (DEC-259). The header, New code,
 * the search and the filters are drawn and work; the count is a bar and
 * the rows are skeletons until the codes land.
 */
export function DiscountsScreen({
    discounts,
    canWrite,
}: {
    discounts: Discount[] | undefined;
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
            id: "gave",
            header: "Gave off",
            priority: "secondary",
            width: "120px",
            numeric: true,
            sortValue: (d) => Number(d.usage?.gaveOff ?? 0),
            cell: (d) => {
                const off = gaveOffOf(d);
                return off ? (
                    <span className="tabular-nums">{off}</span>
                ) : (
                    <span data-ph-unmask="" className="text-muted-foreground">
                        None
                    </span>
                );
            },
        },
        {
            id: "ends",
            header: "Ends",
            priority: "secondary",
            width: "190px",
            sortValue: (d) => d.endsAt ?? "9999",
            cell: (d) => <DiscountEnds discount={d} />,
        },
    ];

    return (
        <>
            <PageHeader
                breadcrumb={["Sell", "Discount codes"]}
                title="Discount codes"
                count={
                    discounts ? (
                        countLabel(discounts.length, {
                            one: "code",
                            other: "codes",
                        })
                    ) : (
                        <FigureLoading />
                    )
                }
                className="mb-0"
                actions={
                    canWrite ? (
                        <Button asChild>
                            <IntentLink href="/commerce/discounts/new">
                                New code
                            </IntentLink>
                        </Button>
                    ) : undefined
                }
            />
            <DataView
                viewId="discounts"
                rows={discounts ?? []}
                isLoading={!discounts}
                loading={
                    <PageLoading
                        bare
                        width="full"
                        shape="rows"
                        label="Loading discount codes"
                    />
                }
                columns={columns}
                rowKey={(d) => d.id}
                rowHref={(d) => `/commerce/discounts/${d.id}`}
                modes={["table", "list"]}
                hideModeToggle
                filters={FILTERS}
                noun={{ one: "code", other: "codes" }}
                showTotal={false}
                searchPlaceholder="Search codes"
                searchableColumnIds={["code"]}
                emptyState={{
                    icon: <TicketPercent />,
                    title: "No discount codes yet",
                    note: "A code takes money off an order: everything, or only the products you choose.",
                    action: canWrite ? (
                        <Button asChild>
                            <IntentLink href="/commerce/discounts/new">
                                New code
                            </IntentLink>
                        </Button>
                    ) : undefined,
                }}
            />
            {/* The rules, one press away rather than a paragraph under
                every list (finding 26, owner). */}
            <details className="group max-w-[68ch] text-[12.5px]">
                <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground underline decoration-border-strong underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    How codes work
                </summary>
                <p
                    data-ph-unmask=""
                    className="mt-1.5 text-pretty leading-[1.45] text-muted-foreground"
                >
                    A code works on an order you take at the counter and, when
                    your website sells, in your customers&rsquo; bag there, with
                    the same dates, limit and reach, and one count of uses. An
                    expired code keeps its figures: how often something was used
                    is a fact about the past, not a setting.
                </p>
            </details>
        </>
    );
}
