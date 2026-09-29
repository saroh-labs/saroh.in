"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { dismissToasts, showError, showUndo } from "@saroh/ui/toast";
import { Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { HOLD_UNDO_MS } from "@/lib/hold-undo";

import { setPlanArchived } from "@/lib/subscriptions/actions";
import type { PlanCardView } from "@/lib/subscriptions/plan-cards";
import { archiveToast, planCard } from "@/lib/subscriptions/plan-cards";
import { editHref } from "@/lib/subscriptions/plan-editor";
import type { Plan, SubscriptionSettings } from "@/lib/subscriptions/service";

import { MembersPauseRow } from "./members-pause-row";
import { Pill } from "./pill";

const BUTTON = "h-[38px] rounded-[9px] px-4 text-[14px] font-semibold";

const NEW_PLAN_HREF = "/billing/plans/new";

/**
 * Subscriptions → Plans (D3, after "Saroh Subscriptions", Plans tab): one
 * card per plan, which opens Plan Detail. Archive and Sell again act at once
 * and offer Undo, which calls the opposite, for the shared ten-second hold
 * (`lib/hold-undo.ts`). New plan and Edit open the Plan Editor (D7); a
 * draft is listed too (`?include=drafts`), badged, with nothing to archive.
 *
 * `plans` is null when the read failed: the tab says so and the
 * subscriptions beside it are untouched.
 */
export function PlansTab({
    plans,
    canWrite,
    showClasses,
    settings = null,
}: {
    plans: Plan[] | null;
    canWrite: boolean;
    showClasses: boolean;
    /**
     * "Members can pause from their account" (A8): its row shows once
     * customers have an account on the site, and not when unread.
     */
    settings?: SubscriptionSettings | null;
}) {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [, start] = useTransition();

    function setArchived(plan: Plan, archived: boolean) {
        setBusyId(plan.id);
        start(async () => {
            const res = await setPlanArchived(plan.id, archived);
            setBusyId(null);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            router.refresh();
            // One Undo on screen at a time: an older one would undo the
            // wrong plan.
            dismissToasts();
            showUndo(
                archiveToast(plan, archived),
                () =>
                    start(async () => {
                        const back = await setPlanArchived(plan.id, !archived);
                        if (!back.ok) showError(back.error);
                        router.refresh();
                    }),
                { duration: HOLD_UNDO_MS },
            );
        });
    }

    if (!plans) {
        return (
            <FailedState
                title="Plans could not be loaded"
                description="This tab couldn't read them. Nothing has changed — every plan is still on sale, and subscriptions still renew."
                action={
                    <Button variant="outline" onClick={() => router.refresh()}>
                        Try again
                    </Button>
                }
            />
        );
    }

    return (
        <>
            {settings?.accountArea ? (
                <MembersPauseRow
                    on={settings.membersCanPause}
                    canWrite={canWrite}
                />
            ) : null}
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
                <p className="flex-[1_1_280px] text-pretty text-[13px] text-foreground/75">
                    Changing a price only changes what&apos;s sold next.
                    Everyone already on a plan keeps what they agreed to.
                </p>
                {canWrite ? (
                    <Button asChild className={BUTTON}>
                        <Link href={NEW_PLAN_HREF}>New plan</Link>
                    </Button>
                ) : null}
            </div>

            {plans.length === 0 ? (
                <EmptyState
                    icon={<Repeat />}
                    title="No plans yet"
                    description="A plan is what you sell on repeat — a monthly membership, a weekly loaf. Make one, then put people on it."
                    action={
                        canWrite ? (
                            <Button asChild>
                                <Link href={NEW_PLAN_HREF}>Make a plan</Link>
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
                    {plans.map((p) => (
                        <li key={p.id}>
                            <PlanCard
                                card={planCard(p, showClasses)}
                                canWrite={canWrite}
                                busy={busyId === p.id}
                                onArchive={() =>
                                    setArchived(p, p.status !== "ARCHIVED")
                                }
                            />
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}

function PlanCard({
    card,
    canWrite,
    busy,
    onArchive,
}: {
    card: PlanCardView;
    canWrite: boolean;
    busy: boolean;
    onArchive: () => void;
}) {
    return (
        <article
            aria-label={card.name}
            className={cn(
                "h-full rounded-[12px] border border-border bg-card px-4 py-3.5",
                card.archived && "opacity-70",
            )}
        >
            <div className="flex items-baseline gap-2">
                <Link
                    href={`/billing/plans/${encodeURIComponent(card.id)}`}
                    className="min-w-0 flex-1 text-[15px] font-semibold text-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    {card.name}
                </Link>
                {card.archived ? <Pill tone="off">Archived</Pill> : null}
                {card.draft ? <Pill tone="off">Draft</Pill> : null}
                {card.unpublished ? (
                    <Pill tone="accent">Unpublished changes</Pill>
                ) : null}
            </div>
            <p className="mt-[3px] min-h-9 text-[12.5px] text-muted-foreground">
                {card.description}
            </p>
            <p className="mt-2 font-display text-[22px] font-semibold tabular-nums tracking-[-0.02em]">
                {card.price}
            </p>
            {card.classes ? (
                <p className="mt-1.5 text-[12.5px] font-semibold">
                    {card.classes}
                </p>
            ) : null}
            <p className="mt-1.5 text-[12.5px] text-foreground/75">
                {card.subscribers}
            </p>
            {card.olderPrices.map((t) => (
                <p key={t} className="mt-0.5 text-[12px] text-brand">
                    {t}
                </p>
            ))}
            {canWrite ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                        asChild
                        variant="outline"
                        className={cn(BUTTON, "coarse:h-11")}
                    >
                        <Link
                            href={editHref(card.id)}
                            aria-label={`Edit ${card.name}`}
                        >
                            Edit
                        </Link>
                    </Button>
                    {card.canArchive ? (
                        <Button
                            variant="outline"
                            className={cn(BUTTON, "coarse:h-11")}
                            disabled={busy}
                            onClick={onArchive}
                        >
                            {card.archived ? "Sell again" : "Archive"}
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </article>
    );
}
