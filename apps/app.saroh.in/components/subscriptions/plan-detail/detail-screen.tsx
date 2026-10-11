"use client";

import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import { dismissToasts, showUndo } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reportFailure } from "@/components/billing/plan-refusal";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { HOLD_UNDO_MS } from "@/lib/hold-undo";
import type { CappedList } from "@/lib/lists/capped";
import { loadPlanEvents, setPlanArchived } from "@/lib/subscriptions/actions";
import type { AutopayTimingSettings } from "@/lib/subscriptions/autopay-timing";
import { archiveToast } from "@/lib/subscriptions/plan-cards";
import type { DetailTab } from "@/lib/subscriptions/plan-detail";
import {
    PLANS_HREF,
    glanceRows,
    historyRows,
    includedText,
    planHeader,
    subscribeHref,
    subscriberRows,
    subscribersEmptyText,
} from "@/lib/subscriptions/plan-detail";
import { editHref } from "@/lib/subscriptions/plan-editor";
import type {
    Optional,
    Plan,
    PlanEventsPage,
    Subscription,
} from "@/lib/subscriptions/service";
import { payRows } from "@/lib/subscriptions/view";

import { StatusBadge } from "@/components/shared/status-badge";
import { runAction } from "@/lib/api/run-action";
import { TabStrip } from "@saroh/ui/tabs";
import { PlanHistory } from "./history";
import { PlanOverview } from "./overview";
import { PlanAutopayTiming } from "./plan-autopay-timing";
import { PlanSubscribers } from "./subscribers";

/**
 * Payments → Plans → one plan (D4), after "Saroh Plan Detail": the header
 * with Archive and Edit plan, then Overview, Subscribers and History.
 * Archive and Open to sign-ups act at once with Undo, for the shared
 * ten-second hold (`lib/hold-undo.ts`); Edit plan opens the Plan Editor
 * (D7), and so does Finish draft.
 *
 * The plan is required; who's on it and its history are read on their own,
 * so either failing costs its own tab and nothing else.
 */
export function PlanDetail({
    plan,
    subscriptions,
    events,
    withClasses,
    timeZone,
    canWrite,
    initialTab,
    nowIso,
    autopay = null,
}: {
    plan: Plan;
    subscriptions: Optional<CappedList<Subscription>>;
    events: Optional<PlanEventsPage>;
    withClasses: boolean;
    timeZone: string;
    canWrite: boolean;
    initialTab: DetailTab;
    nowIso: string;
    /** "When autopay charges" (D13B); null when autopay can't charge. */
    autopay?: AutopayTimingSettings | null;
}) {
    const router = useRouter();
    const now = new Date(nowIso);
    const [tab, setTab] = useState<DetailTab>(initialTab);
    const [busy, setBusy] = useState(false);
    const [, start] = useTransition();
    const firstPage = events.state === "ok" ? events.data : null;
    // Older pages, once asked for; a refresh starts again from the newest.
    const [older, setOlder] = useState<PlanEventsPage[]>([]);
    const [loadingMore, setLoadingMore] = useState(false);
    const [moreFailed, setMoreFailed] = useState(false);

    const head = planHeader(plan, withClasses);
    const included = includedText(plan, withClasses);
    const subs = subscriptions.state === "ok" ? subscriptions.data : null;
    const pages = firstPage ? [firstPage, ...older] : [];
    const last = pages.at(-1) ?? null;

    function pick(next: DetailTab) {
        setTab(next);
        // The tab is in the address, so Back and a shared link land on it.
        const url = new URL(window.location.href);
        if (next === "overview") url.searchParams.delete("tab");
        else url.searchParams.set("tab", next);
        window.history.replaceState(null, "", url.pathname + url.search);
    }

    function archive() {
        // A draft has nothing to archive: finishing it is editing it.
        if (plan.status === "DRAFT") {
            router.push(editHref(plan.id));
            return;
        }
        const to = plan.status !== "ARCHIVED";
        setBusy(true);
        start(async () => {
            const res = await runAction(() => setPlanArchived(plan.id, to));
            setBusy(false);
            if (!res) return;
            if (!res.ok) {
                // A plan without memberships refuses Sell again: its notice.
                reportFailure(res);
                return;
            }
            setOlder([]);
            router.refresh();
            dismissToasts();
            showUndo(
                archiveToast(plan, to),
                () =>
                    start(async () => {
                        const back = await runAction(() =>
                            setPlanArchived(plan.id, !to),
                        );
                        if (!back) return;
                        if (!back.ok) reportFailure(back);
                        setOlder([]);
                        router.refresh();
                    }),
                { duration: HOLD_UNDO_MS },
            );
        });
    }

    function more() {
        if (!last?.nextCursor) return;
        const cursor = last.nextCursor;
        setLoadingMore(true);
        setMoreFailed(false);
        start(async () => {
            const res = await runAction(() => loadPlanEvents(plan.id, cursor));
            setLoadingMore(false);
            if (!res) return;
            if (res.state !== "ok") {
                setMoreFailed(true);
                return;
            }
            setOlder((o) => [...o, res.data]);
        });
    }

    function retry() {
        setOlder([]);
        router.refresh();
    }

    const subscribeTo = subscribeHref(plan);
    const TABS: { key: DetailTab; label: string }[] = [
        { key: "overview", label: "Overview" },
        {
            key: "subscribers",
            label: subs ? `Subscribers · ${subs.rows.length}` : "Subscribers",
        },
        { key: "history", label: "History" },
    ];

    return (
        <>
            <div className="px-4 pt-5 sm:px-[26px]">
                <PageHeader
                    holdsData
                    className="mb-0"
                    breadcrumb={[
                        "Payments",
                        <Link key="plans" href={PLANS_HREF}>
                            Plans
                        </Link>,
                        plan.name,
                    ]}
                    title={plan.name}
                    badge={
                        <>
                            <StatusBadge tone={head.state.tone}>
                                {head.state.label}
                            </StatusBadge>
                            {head.unpublished ? (
                                <StatusBadge tone="accent">
                                    Unpublished changes
                                </StatusBadge>
                            ) : null}
                        </>
                    }
                    description={head.subline}
                    actions={
                        canWrite ? (
                            <>
                                <Button
                                    variant="outline"
                                    disabled={busy}
                                    onClick={archive}
                                >
                                    {head.archiveLabel}
                                </Button>
                                {subscribeTo ? (
                                    // From the plan itself (UX-080): the
                                    // dialog, opened on this plan.
                                    <Button asChild variant="outline">
                                        <Link href={subscribeTo}>
                                            Subscribe someone
                                        </Link>
                                    </Button>
                                ) : null}
                                <Button asChild>
                                    <Link href={editHref(plan.id)}>
                                        Edit plan
                                    </Link>
                                </Button>
                            </>
                        ) : undefined
                    }
                />
            </div>
            {head.banner ? (
                <p className="mx-4 mt-3 rounded-[10px] bg-muted px-3.5 py-2.5 text-[13px] leading-[1.5] text-foreground sm:mx-[26px]">
                    {head.banner}
                </p>
            ) : null}
            {!canWrite ? (
                <ReadOnlyNote className="mx-4 mb-0 mt-3 sm:mx-[26px]">
                    Your role can see this plan but not change it.
                </ReadOnlyNote>
            ) : null}

            <TabStrip
                label="Plan"
                idPrefix="plan-tab"
                value={tab}
                onValueChange={pick}
                className="mt-3.5"
                listClassName="px-4 sm:px-[26px]"
                tabs={TABS.map((t) => ({
                    value: t.key,
                    label: t.label,
                    controls: "plan-panel",
                }))}
            />

            <div
                id="plan-panel"
                role="tabpanel"
                aria-labelledby={`plan-tab-${tab}`}
                className="px-4 pb-7 pt-[18px] sm:px-[26px]"
            >
                {tab === "overview" ? (
                    <PlanOverview
                        what={included.what}
                        classes={included.classes}
                        pays={payRows(plan)}
                        glance={glanceRows(plan, firstPage)}
                        autopay={
                            autopay?.available ? (
                                <PlanAutopayTiming
                                    planId={plan.id}
                                    planTiming={
                                        plan.autopayChargeTiming ?? null
                                    }
                                    settings={autopay}
                                    canWrite={canWrite}
                                    nowIso={nowIso}
                                />
                            ) : null
                        }
                    />
                ) : tab === "subscribers" ? (
                    <PlanSubscribers
                        rows={
                            subs ? subscriberRows(subs.rows, plan, now) : null
                        }
                        truncated={subs?.truncated ?? false}
                        emptyText={subscribersEmptyText(plan)}
                        onRetry={retry}
                    />
                ) : (
                    <PlanHistory
                        rows={
                            last
                                ? historyRows(
                                      uniqueEvents(pages),
                                      last,
                                      plan.currency,
                                      timeZone,
                                      now,
                                  )
                                : null
                        }
                        hasMore={Boolean(last?.nextCursor)}
                        loadingMore={loadingMore}
                        moreFailed={moreFailed}
                        onMore={more}
                        onRetry={retry}
                    />
                )}
            </div>
        </>
    );
}

/** Every page's events once: a page read after a change may repeat one. */
function uniqueEvents(pages: readonly PlanEventsPage[]) {
    const seen = new Set<string>();
    return pages
        .flatMap((p) => p.events)
        .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}
