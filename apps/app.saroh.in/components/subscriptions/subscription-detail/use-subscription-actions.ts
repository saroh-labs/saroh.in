"use client";

import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useHold } from "@/components/shared/use-hold";
import { UNREACHED } from "@/lib/api/unreached";
import { newPayLink as makePayLink } from "@/lib/invoices/link-actions";
import {
    cancelPlanChange,
    cancelSubscription,
    changePlan,
    keepSubscription,
    pauseSubscription,
    resumeSubscription,
    retrySubscription,
    skipCollection,
    unskipCollection,
} from "@/lib/subscriptions/actions";
import type { PauseOption } from "@/lib/subscriptions/pause";
import { pauseAgain } from "@/lib/subscriptions/pause";
import type { Plan, Subscription } from "@/lib/subscriptions/service";
import type { CollectionRow } from "@/lib/subscriptions/view";
import { dayText } from "@/lib/subscriptions/view";

/**
 * Subscription Detail's writes. Each is one call, then the page reads again.
 * Its toast carries the Undo (the inverse call), and `showUndo` says how
 * that went. Cancel tells the customer, so it waits ten seconds with Undo
 * before anything is written (`useHold`).
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
    const { send } = useHold();

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
            error: UNREACHED,
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

    /** An Undo: the inverse call, then the page reads again. */
    const undo =
        (call: () => Promise<{ ok: boolean; error?: string }>) => async () => {
            const r = await call();
            router.refresh();
            return r;
        };

    const periodEndText = dayText(sub.currentPeriodEnd, tz, now);
    const nextText = sub.nextRenewalAt
        ? dayText(sub.nextRenewalAt, tz, now)
        : null;

    function pause(option: PauseOption) {
        void run(
            () => pauseSubscription(sub.id, option.choice),
            () => {
                closeStep();
                showUndo(
                    option.until
                        ? `Paused until ${dayText(option.until, tz, now)}. It restarts on its own.`
                        : "Paused. Nothing is charged until you resume it.",
                    undo(() => resumeSubscription(sub.id)),
                );
            },
        );
    }
    function resume() {
        // Undo puts the same pause back, to the same day when it had one.
        const again = pauseAgain(sub, now);
        void run(
            () => resumeSubscription(sub.id),
            () =>
                showUndo(
                    "Resumed.",
                    undo(() => pauseSubscription(sub.id, again)),
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
        closeStep();
        send(`cancel-subscription:${sub.id}`, {
            soon: "Cancelling in 10 seconds",
            description:
                when === "periodEnd"
                    ? `It ends on ${periodEndText}.`
                    : "It ends today, and nothing more is charged.",
            run: async () => {
                const res = await cancelSubscription(
                    sub.id,
                    when,
                    voidInvoiceId,
                );
                router.refresh();
                return res.ok ? { ok: true } : { ok: false, error: res.error };
            },
            sent: "Subscription cancelled.",
            sentDescription:
                when === "periodEnd"
                    ? `It ends on ${periodEndText}.`
                    : "Nothing more is charged.",
            failed: "The subscription wasn't cancelled.",
        });
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
        const skipped = row.skipped;
        setBusyDate(row.date);
        await run(
            () =>
                skipped
                    ? unskipCollection(sub.id, row.date)
                    : skipCollection(sub.id, row.date),
            () =>
                showUndo(
                    skipped
                        ? `Back on: ${row.label}.`
                        : `Skipped ${row.label}. Nothing is refunded. It just isn't collected.`,
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
            () => makePayLink(invoiceId),
            (res) => {
                if ("data" in res) setPayLink(res.data.url);
                showSuccess(
                    "Pay link made.",
                    "The one sent before no longer works.",
                );
            },
        );
    }

    /**
     * "Charge autopay again" (D13): a new charge on their mandate. Their
     * bank tells them a day ahead, so it lands in a day or two; if the
     * provider had already collected the last one, the renewal is paid.
     */
    function chargeAgain() {
        void run(
            () => retrySubscription(sub.id, "MANDATE"),
            (res) => {
                if ("data" in res && res.data.paid) {
                    showSuccess(
                        "Autopay had already collected it. The renewal is paid.",
                    );
                    return;
                }
                showSuccess(
                    "Autopay charge started.",
                    "Their bank tells them a day ahead, so the payment lands in a day or two.",
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
        chargeAgain,
    };
}
