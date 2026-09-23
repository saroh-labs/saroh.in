"use client";

import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createPayLink } from "@/lib/invoices/actions";
import {
    cancelPlanChange,
    cancelSubscription,
    changePlan,
    keepSubscription,
    pauseSubscription,
    resumeSubscription,
    skipCollection,
    unskipCollection,
} from "@/lib/subscriptions/actions";
import type { Plan, Subscription } from "@/lib/subscriptions/service";
import type { CollectionRow } from "@/lib/subscriptions/view";
import { dayText } from "@/lib/subscriptions/view";

/**
 * Subscription Detail's writes. Each is one call, then the page reads again;
 * its toast carries the Undo — the inverse call — and an Undo that fails says
 * so rather than going quiet.
 */
export function useSubscriptionActions(
    sub: Subscription,
    plans: readonly Plan[],
    now: Date,
    closeStep: () => void,
) {
    const router = useRouter();
    const tz = sub.timezone;
    const [busy, setBusy] = useState(false);
    const [busyDate, setBusyDate] = useState<string | null>(null);
    const [payLink, setPayLink] = useState<string | null>(null);

    /** One call, then the page reads again; the toast offers the way back. */
    async function run<T extends { ok: boolean; error?: string }>(
        call: () => Promise<T>,
        done: (res: T) => void,
    ): Promise<boolean> {
        setBusy(true);
        // A request that never answers (offline, refused) is a failure too,
        // not a button left saying "Pausing…".
        const res = await call().catch((): { ok: false; error: string } => ({
            ok: false,
            error: "Saroh couldn't be reached. Nothing was changed — try again.",
        }));
        setBusy(false);
        if (!res.ok) {
            showError(res.error ?? "That didn't go through.");
            router.refresh();
            return false;
        }
        done(res);
        router.refresh();
        return true;
    }

    /** An Undo that reports its own failure rather than going quiet. */
    const undo =
        (call: () => Promise<{ ok: boolean; error?: string }>) => () => {
            void call().then((r) => {
                if (!r.ok) showError(r.error ?? "Couldn't undo that.");
                router.refresh();
            });
        };

    const periodEndText = dayText(sub.currentPeriodEnd, tz, now);
    const nextText = sub.nextRenewalAt
        ? dayText(sub.nextRenewalAt, tz, now)
        : null;

    function pause() {
        void run(
            () => pauseSubscription(sub.id),
            () => {
                closeStep();
                showUndo(
                    "Paused. Nothing is charged until you resume it.",
                    undo(() => resumeSubscription(sub.id)),
                );
            },
        );
    }
    function resume() {
        void run(
            () => resumeSubscription(sub.id),
            () =>
                showUndo(
                    "Resumed.",
                    undo(() => pauseSubscription(sub.id)),
                ),
        );
    }
    function switchTo(planId: string) {
        const plan = plans.find((p) => p.id === planId);
        const before = sub.pendingPlan?.id ?? null;
        void run(
            () => changePlan(sub.id, planId),
            () => {
                closeStep();
                showUndo(
                    `Switches to ${plan?.name ?? "the new plan"}${nextText ? ` on ${nextText}` : " at the next renewal"}.`,
                    undo(() =>
                        before
                            ? changePlan(sub.id, before)
                            : cancelPlanChange(sub.id),
                    ),
                );
            },
        );
    }
    function keepCurrentPlan() {
        const before = sub.pendingPlan?.id;
        void run(
            () => cancelPlanChange(sub.id),
            () =>
                showUndo(
                    `Stays on ${sub.plan.name}.`,
                    undo(() =>
                        before
                            ? changePlan(sub.id, before)
                            : Promise.resolve({ ok: true }),
                    ),
                ),
        );
    }
    function cancel(when: "now" | "periodEnd", voidInvoiceId?: string) {
        void run(
            () => cancelSubscription(sub.id, when, voidInvoiceId),
            () => {
                closeStep();
                if (when === "periodEnd") {
                    showUndo(
                        `Cancelled. It ends on ${periodEndText}.`,
                        undo(() => keepSubscription(sub.id)),
                    );
                } else {
                    showSuccess("Cancelled. Nothing more is charged.");
                }
            },
        );
    }
    function keep() {
        void run(
            () => keepSubscription(sub.id),
            () =>
                showUndo(
                    "It keeps renewing.",
                    undo(() => cancelSubscription(sub.id, "periodEnd")),
                ),
        );
    }
    async function toggleSkip(row: CollectionRow) {
        setBusyDate(row.date);
        const skipped = row.skipped;
        await run(
            () =>
                skipped
                    ? unskipCollection(sub.id, row.date)
                    : skipCollection(sub.id, row.date),
            () =>
                showUndo(
                    skipped
                        ? `Back on: ${row.label}.`
                        : `Skipped ${row.label}. Nothing is refunded — it just isn't collected.`,
                    undo(() =>
                        skipped
                            ? skipCollection(sub.id, row.date)
                            : unskipCollection(sub.id, row.date),
                    ),
                ),
        );
        setBusyDate(null);
    }
    function newPayLink() {
        const invoiceId = sub.failedCharge?.id;
        if (!invoiceId) return;
        void run(
            () => createPayLink(invoiceId),
            (res) => {
                if ("data" in res) setPayLink(res.data.url);
                showSuccess(
                    "New pay link ready — the one sent before no longer works.",
                );
            },
        );
    }

    return {
        busy,
        busyDate,
        payLink,
        pause,
        resume,
        switchTo,
        keepCurrentPlan,
        cancel,
        keep,
        toggleSkip,
        newPayLink,
    };
}
