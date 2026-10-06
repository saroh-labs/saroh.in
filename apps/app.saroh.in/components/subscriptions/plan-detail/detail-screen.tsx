"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { dismissToasts, showUndo } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

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

import { PaymentsCrumbs } from "../payments-crumbs";
import { Pill } from "../pill";
import { PlanHistory } from "./history";
import { PlanOverview } from "./overview";
import { PlanAutopayTiming } from "./plan-autopay-timing";
import { PlanSubscribers } from "./subscribers";

const BTN = "h-[38px] rounded-[9px] px-4 text-[14px] font-semibold";

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
    const tabs = useRef<HTMLDivElement>(null);

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

    function keys(e: React.KeyboardEvent) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const order: DetailTab[] = ["overview", "subscribers", "history"];
        const i = order.indexOf(tab);
        const n = (i + (e.key === "ArrowRight" ? 1 : order.length - 1)) % 3;
        pick(order[n]);
        tabs.current
            ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
            .item(n)
            .focus();
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
            const res = await setPlanArchived(plan.id, to);
            setBusy(false);
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
                        const back = await setPlanArchived(plan.id, !to);
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
            const res = await loadPlanEvents(plan.id, cursor);
            setLoadingMore(false);
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
            <PaymentsCrumbs
                here={plan.name}
                trail={[{ href: PLANS_HREF, label: "Plans" }]}
            />
            <div className="flex flex-wrap items-start gap-3 px-6 pt-[18px]">
                <div className="min-w-0 flex-[1_1_300px]">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <h1 className="font-display text-[26px] font-semibold tracking-[-0.03em]">
                            {plan.name}
                        </h1>
                        <Pill tone={head.state.tone}>{head.state.label}</Pill>
                        {head.unpublished ? (
                            <Pill tone="accent">Unpublished changes</Pill>
                        ) : null}
                    </div>
                    <p className="mt-1 text-[13.5px] text-foreground/75">
                        {head.subline}
                    </p>
                </div>
                {canWrite ? (
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            className={cn(BTN, "coarse:h-11")}
                            disabled={busy}
                            onClick={archive}
                        >
                            {head.archiveLabel}
                        </Button>
                        <Button asChild className={cn(BTN, "coarse:h-11")}>
                            <Link href={editHref(plan.id)}>Edit plan</Link>
                        </Button>
                    </div>
                ) : null}
            </div>
            {head.banner ? (
                <p className="mx-6 mt-3 rounded-[10px] bg-brand-subtle px-3.5 py-2.5 text-[13px] leading-[1.5] text-brand-subtle-foreground">
                    {head.banner}
                </p>
            ) : null}
            {!canWrite ? (
                <ReadOnlyNote className="mx-6 mb-0 mt-3">
                    Your role can see this plan but not change it.
                </ReadOnlyNote>
            ) : null}

            <div
                ref={tabs}
                role="tablist"
                aria-label="Plan"
                onKeyDown={keys}
                className="flex flex-wrap gap-0.5 border-b border-border px-6 pt-3.5"
            >
                {TABS.map((t) => {
                    const on = t.key === tab;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            role="tab"
                            id={`plan-tab-${t.key}`}
                            aria-selected={on}
                            aria-controls="plan-panel"
                            tabIndex={on ? 0 : -1}
                            onClick={() => pick(t.key)}
                            className={cn(
                                "-mb-px border-b-2 px-3 pb-2.5 pt-2 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                                on
                                    ? "border-foreground font-semibold text-foreground"
                                    : "border-transparent font-medium text-muted-foreground hover:text-foreground active:bg-accent-active",
                            )}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>

            <div
                id="plan-panel"
                role="tabpanel"
                aria-labelledby={`plan-tab-${tab}`}
                className="px-6 pb-7 pt-[18px]"
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
