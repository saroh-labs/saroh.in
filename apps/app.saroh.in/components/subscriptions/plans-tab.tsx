"use client";

import { AbsentValue } from "@saroh/ui/absent-value";
import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IconButton } from "@saroh/ui/icon-button";
import { couldntLoad, nothingChanged } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { dismissToasts, showSuccess, showUndo } from "@saroh/ui/toast";
import {
    Archive,
    MoreHorizontal,
    Pencil,
    Repeat,
    RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

import { LimitNoticeBlock } from "@/components/billing/limit-notice";
import { reportFailure } from "@/components/billing/plan-refusal";
import { MissingRatesNotice } from "@/components/gst-rates/missing-rates-notice";
import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { runAction } from "@/lib/api/run-action";
import type { OnlinePaymentsLock } from "@/lib/billing/access";
import { formatNumber } from "@/lib/format/money";
import { plural } from "@/lib/format/plural";
import type { MissingRates } from "@/lib/gst-rates/missing";
import { HOLD_UNDO_MS } from "@/lib/hold-undo";
import { setPlanArchived } from "@/lib/subscriptions/actions";
import type { PlanRowView } from "@/lib/subscriptions/plan-cards";
import {
    archiveToast,
    inPlanView,
    missingRatesAlso,
    PLAN_VIEW_LABEL,
    PLAN_VIEWS,
    planRow,
} from "@/lib/subscriptions/plan-cards";
import { editHref } from "@/lib/subscriptions/plan-editor";
import type { Plan, SubscriptionSettings } from "@/lib/subscriptions/service";

import { PlanSettings } from "./plan-settings";

export const NEW_PLAN_HREF = "/billing/plans/new";

/**
 * The shared list is a table from 760px and rows of words below it
 * (`TABLE_MIN_WIDTH` in `@saroh/ui/data-view`). A table cell sits under its
 * column's name, so it is the figure alone. A phone's row has no column
 * names, so there the cell says what it is ("15 subscribers").
 */
const DESK_ONLY = "max-[759.98px]:hidden";
const PHONE_ONLY = "min-[760px]:hidden";

function Cell({ desk, phone }: { desk: ReactNode; phone: ReactNode }) {
    return (
        <>
            <span className={DESK_ONLY}>{desk}</span>
            <span className={PHONE_ONLY}>{phone}</span>
        </>
    );
}

/**
 * Subscriptions → Plans (D3): the plans as rows of the shared list
 * (Subscriptions audit, 12 Oct 2026; a wall of cards before). A row is the
 * plan's name with Draft, Archived or Unpublished changes in words, its
 * price and how often, what is included, who is on it and what they bring
 * in a month, and it opens Plan Detail. The views are the list's one
 * dropdown, each with its count: Live (what is on sale, where it opens),
 * Archived, Drafts and all of them (`?view=`).
 *
 * Edit, Archive and Sell again are in each row's menu, not on its face.
 * Archive and Sell again act at once and offer Undo, which calls the
 * opposite, for the shared ten-second hold (`lib/hold-undo.ts`). "New
 * plan" is the page's main button on this tab (`subscriptions-screen.tsx`).
 *
 * `plans` is null when the read failed: the tab says so and the
 * subscriptions beside it are untouched.
 *
 * `locked` (6 Oct 2026): the business's plan leaves memberships off. The
 * notice says so, with the way up; the plans stay listed to open, edit and
 * archive, but nothing new goes on sale ("New plan" and "Sell again" are
 * gone; the API refuses them too).
 *
 * A GST-registered business with priced things on sale and no GST rate
 * reads one line saying so, with the sheet to choose them in, as Services
 * and Invoices do (`missingRates`; unread, it says nothing). Here it also
 * says how many of the plans it counts are archived ones with members
 * still on them, since the tab counts only live plans.
 *
 * What is set once for every plan (members pausing, when autopay charges)
 * is a small group of read-first rows under the list (`PlanSettings`).
 */
export function PlansTab({
    plans,
    canWrite,
    showClasses,
    settings = null,
    nowIso,
    locked = null,
    missingRates = null,
    initialView,
}: {
    /**
     * What is on sale with a price and no GST rate, for a GST-registered
     * business; null when it couldn't be told, which draws nothing.
     */
    missingRates?: MissingRates | null;
    plans: Plan[] | null;
    canWrite: boolean;
    showClasses: boolean;
    /**
     * "Members can pause from their account" (A8): its row shows once
     * customers have an account on the site, and not when unread. "When
     * autopay charges" (D13B): only when autopay can charge.
     */
    settings?: SubscriptionSettings | null;
    /** Now, from the server: the timing previews' sample renewal. */
    nowIso?: string;
    /** Memberships aren't on the business's plan: say so, sell nothing new. */
    locked?: OnlinePaymentsLock | null;
    /** `?view=`: the view the address chose. Unknown opens on Live. */
    initialView?: string;
}) {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [, start] = useTransition();

    function setArchived(plan: Plan, archived: boolean) {
        setBusyId(plan.id);
        start(async () => {
            const res = await runAction(() =>
                setPlanArchived(plan.id, archived),
            );
            setBusyId(null);
            if (!res) return;
            if (!res.ok) {
                // A plan without memberships refuses Sell again: its notice.
                reportFailure(res);
                return;
            }
            router.refresh();
            // One Undo on screen at a time: an older one would undo the
            // wrong plan.
            dismissToasts();
            // Undo would sell it again, which the plan doesn't allow now:
            // offering it would be a button that only fails.
            if (locked && archived) {
                showSuccess(archiveToast(plan, archived));
                return;
            }
            showUndo(
                archiveToast(plan, archived),
                () =>
                    start(async () => {
                        const back = await runAction(() =>
                            setPlanArchived(plan.id, !archived),
                        );
                        if (!back) return;
                        if (!back.ok) reportFailure(back);
                        router.refresh();
                    }),
                { duration: HOLD_UNDO_MS },
            );
        });
    }

    if (!plans) {
        return (
            <FailedState
                title={couldntLoad("plans")}
                description={nothingChanged(
                    "Every plan is still on sale, and subscriptions still renew.",
                )}
                onRetry={() => router.refresh()}
            />
        );
    }

    const words = new Map(plans.map((p) => [p.id, planRow(p, showClasses)]));
    const row = (p: Plan): PlanRowView =>
        words.get(p.id) ?? planRow(p, showClasses);

    const filters: DataFilter<Plan>[] = PLAN_VIEWS.map((view) => ({
        id: view,
        label: PLAN_VIEW_LABEL[view],
        predicate:
            view === "all" ? undefined : (p: Plan) => inPlanView(p, view),
    }));

    const columns: DataColumn<Plan>[] = [
        {
            id: "plan",
            header: "Plan",
            priority: "primary",
            sortValue: (p) => p.name.toLowerCase(),
            cell: (p) => {
                const r = row(p);
                return (
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                            className={cn(
                                "min-w-0 truncate font-medium",
                                // An archived plan stays in the list, quieter.
                                r.archived && "text-muted-foreground",
                            )}
                        >
                            {r.name}
                        </span>
                        {r.archived ? (
                            <StatusBadge tone="off">Archived</StatusBadge>
                        ) : null}
                        {r.draft ? (
                            <StatusBadge tone="off">Draft</StatusBadge>
                        ) : null}
                        {r.unpublished ? (
                            <StatusBadge tone="accent">
                                Unpublished changes
                            </StatusBadge>
                        ) : null}
                    </span>
                );
            },
        },
        {
            id: "price",
            header: "Price",
            priority: "secondary",
            numeric: true,
            money: true,
            // A month's worth, so a yearly plan sorts beside a monthly one.
            sortValue: (p) => Number(p.monthly),
            // The price the business set, saying so where GST comes on
            // top of it ("₹2,000 a month + GST").
            cell: (p) => row(p).price,
        },
        ...(showClasses
            ? [
                  {
                      id: "included",
                      header: "What is included",
                      priority: "secondary",
                      cell: (p) => row(p).classes,
                  } satisfies DataColumn<Plan>,
              ]
            : []),
        {
            id: "subscribers",
            header: "Subscribers",
            priority: "secondary",
            sortValue: (p) => p.subscriberCount,
            cell: (p) => {
                const r = row(p);
                if (r.subscribers === 0) {
                    return (
                        <Cell
                            desk={<AbsentValue says="None" />}
                            phone="No subscribers yet"
                        />
                    );
                }
                return (
                    <span className="block min-w-0">
                        <span className="tabular-nums">
                            {formatNumber(r.subscribers)}
                            <span className={PHONE_ONLY}>
                                {" "}
                                {plural(r.subscribers, "subscriber")}
                            </span>
                        </span>
                        {/* Who keeps an older price, where anyone does. */}
                        {r.olderPrices.map((t) => (
                            <span
                                key={t}
                                className="mt-0.5 block whitespace-normal text-[12px] text-muted-foreground"
                            >
                                {t}
                            </span>
                        ))}
                    </span>
                );
            },
        },
        {
            id: "monthly",
            header: "Brings in a month",
            priority: "secondary",
            numeric: true,
            money: true,
            sortValue: (p) => Number(p.monthlyFromMembers),
            cell: (p) => {
                const r = row(p);
                // Nobody on it: the Subscribers cell has said so.
                if (r.subscribers === 0) {
                    return (
                        <Cell desk={<AbsentValue says="None" />} phone={null} />
                    );
                }
                if (r.monthly === null) {
                    return (
                        <span className="font-sans font-normal text-muted-foreground">
                            None paying right now
                        </span>
                    );
                }
                // Money coming in: what members pay, GST and all.
                return (
                    <Cell
                        desk={r.monthly}
                        phone={`brings in ${r.monthly} a month`}
                    />
                );
            },
        },
    ];

    return (
        <>
            {locked ? (
                <LimitNoticeBlock
                    full={false}
                    title={locked.title}
                    body={locked.body}
                    cta={locked.cta}
                    href={locked.href}
                    className="mb-3"
                />
            ) : null}
            {/* Priced things on sale with no GST rate, for a registered
                business: one line, and the sheet to choose them in. */}
            <MissingRatesNotice
                missing={missingRates}
                also={missingRatesAlso(plans, missingRates)}
                className="mb-3"
            />

            {plans.length === 0 ? (
                <EmptyState
                    icon={<Repeat />}
                    title="No plans yet"
                    description="A plan is what you sell on repeat, like a monthly membership or a weekly loaf."
                    action={
                        canWrite && !locked ? (
                            <Button asChild>
                                <Link href={NEW_PLAN_HREF}>New plan</Link>
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <DataView
                    viewId="plans"
                    rows={plans}
                    columns={columns}
                    rowKey={(p) => p.id}
                    rowHref={(p) =>
                        `/billing/plans/${encodeURIComponent(p.id)}`
                    }
                    modes={["table", "list"]}
                    hideModeToggle
                    noun={{ one: "plan", other: "plans" }}
                    filters={filters}
                    filterLabel="Plan status"
                    initialFilterId={initialView}
                    searchableColumnIds={["plan"]}
                    rowActions={
                        canWrite
                            ? (p) => (
                                  <PlanRowMenu
                                      row={row(p)}
                                      sellsAgain={!locked}
                                      busy={busyId === p.id}
                                      onArchive={() =>
                                          setArchived(
                                              p,
                                              p.status !== "ARCHIVED",
                                          )
                                      }
                                  />
                              )
                            : undefined
                    }
                />
            )}

            <PlanSettings
                settings={settings}
                canWrite={canWrite}
                nowIso={nowIso}
            />
        </>
    );
}

/**
 * A row's "More actions": Edit, and Archive or Sell again. They are off
 * the row's face, so taking a plan off sale is never as easy to hit as
 * opening it.
 */
function PlanRowMenu({
    row,
    sellsAgain,
    busy,
    onArchive,
}: {
    row: PlanRowView;
    /** False while the plan leaves memberships off: no "Sell again". */
    sellsAgain: boolean;
    busy: boolean;
    onArchive: () => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton
                    label={`More actions for ${row.name}`}
                    icon={<MoreHorizontal />}
                    variant="ghost"
                    className="text-muted-foreground"
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem asChild>
                    <Link href={editHref(row.id)}>
                        <Pencil aria-hidden />
                        Edit
                    </Link>
                </DropdownMenuItem>
                {row.canArchive && (sellsAgain || !row.archived) ? (
                    <DropdownMenuItem disabled={busy} onSelect={onArchive}>
                        {row.archived ? (
                            <>
                                <RotateCcw aria-hidden />
                                Sell again
                            </>
                        ) : (
                            <>
                                <Archive aria-hidden />
                                Archive
                            </>
                        )}
                    </DropdownMenuItem>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
