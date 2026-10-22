"use client";

import { AbsentOr } from "@saroh/ui/absent-value";
import { cn } from "@saroh/ui/lib/utils";

import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import type { Plan, Subscription } from "@/lib/subscriptions/service";
import type { ListView } from "@/lib/subscriptions/view";
import {
    initials,
    inView,
    listTab,
    listViews,
    olderPrice,
    recurringPrice,
    rowWhen,
    subscriptionPay,
    TAB_LABEL,
    TAB_TONE,
    VIEW_LABEL,
} from "@/lib/subscriptions/view";

/**
 * Who is subscribed, as rows of the shared list (Subscriptions audit, 12
 * Oct 2026; a list of its own before). A row is who and which plan, where
 * it stands as a word, what comes next or why it stopped (in red when it
 * needs the owner), and what they pay a period. It opens the quick look.
 *
 * The views are the list's one dropdown, each with its count: Need you
 * (renewals that aren't paid), Active, Paused, Cancelled and all of them.
 * The list opens on Need you when anyone does, else on Active
 * (`listViews` puts that view first, which is where the shared list opens
 * and where "Clear filters" returns). A view someone chose is in the
 * address as `?view=` and wins over that. Search is by the subscriber's
 * name and the plan's.
 */
export function SubscribersList({
    subscriptions,
    plans,
    now,
    initialView,
    onOpen,
}: {
    subscriptions: Subscription[];
    plans: readonly Plan[];
    now: Date;
    /** The view the address chose; null opens on the default. */
    initialView: ListView | null;
    onOpen: (sub: Subscription) => void;
}) {
    const filters: DataFilter<Subscription>[] = listViews(subscriptions).map(
        (view) => ({
            id: view,
            label: VIEW_LABEL[view],
            predicate:
                view === "all"
                    ? undefined
                    : (s: Subscription) => inView(s, view),
        }),
    );

    const columns: DataColumn<Subscription>[] = [
        {
            id: "subscriber",
            header: "Subscriber",
            priority: "primary",
            // Search reads this: the name, then the plan.
            sortValue: (s) => `${s.contact.name} ${s.plan.name}`.toLowerCase(),
            cell: (s) => {
                const older = olderPrice(s, plans);
                return (
                    <span className="flex min-w-0 items-center gap-3">
                        <span
                            aria-hidden
                            className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold text-foreground"
                        >
                            {initials(s.contact.name)}
                        </span>
                        <span className="block min-w-0">
                            <span className="block truncate font-medium">
                                {s.contact.name}
                            </span>
                            <span className="mt-0.5 block whitespace-normal text-[12.5px] font-normal text-muted-foreground">
                                {s.plan.name}
                                {s.pendingPlan && listTab(s) !== "cancelled"
                                    ? ` → ${s.pendingPlan.name} next renewal`
                                    : ""}
                                {older ? (
                                    <>
                                        {" · "}
                                        <span className="text-foreground">
                                            older price
                                        </span>
                                    </>
                                ) : null}
                            </span>
                        </span>
                    </span>
                );
            },
        },
        {
            id: "status",
            header: "Status",
            priority: "secondary",
            cell: (s) => {
                const tab = listTab(s);
                return (
                    <StatusBadge tone={TAB_TONE[tab]}>
                        {TAB_LABEL[tab]}
                    </StatusBadge>
                );
            },
        },
        {
            id: "next",
            header: "Next",
            priority: "secondary",
            cell: (s) => {
                const when = rowWhen(s, now);
                return (
                    <span
                        className={cn(
                            "whitespace-normal",
                            // The row that needs the owner says so in red.
                            when.danger &&
                                "font-medium text-destructive-subtle-foreground",
                        )}
                    >
                        <AbsentOr says="None">{when.text}</AbsentOr>
                    </span>
                );
            },
        },
        {
            id: "pays",
            header: "Pays",
            priority: "secondary",
            numeric: true,
            money: true,
            sortValue: (s) => Number(subscriptionPay(s)),
            // What they pay a period, GST and all.
            cell: (s) =>
                recurringPrice(subscriptionPay(s), s.currency, s.interval),
        },
    ];

    return (
        <DataView
            viewId="subscriptions"
            rows={subscriptions}
            columns={columns}
            rowKey={(s) => s.id}
            onRowClick={onOpen}
            modes={["table", "list"]}
            hideModeToggle
            noun={{ one: "subscription", other: "subscriptions" }}
            // The header says how many.
            showTotal={false}
            filters={filters}
            filterLabel="Subscription status"
            initialFilterId={initialView ?? undefined}
            searchableColumnIds={["subscriber"]}
            searchPlaceholder="Search subscriptions"
        />
    );
}
