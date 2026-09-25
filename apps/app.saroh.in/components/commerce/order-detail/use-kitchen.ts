"use client";

import {
    dismissToasts,
    showError,
    showInfo,
    showSuccess,
    showUndo,
} from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { formatMoney } from "@/lib/format/money";
import {
    editBeforePreparing,
    moveStage,
    refundLines,
    retryRefund as retryRefundAction,
    undoStage,
} from "@/lib/orders/actions";
import type { EditOrderInput } from "@/lib/orders/kitchen-service";
import { HOLD_MS, STAGE_LABEL } from "@/lib/orders/lifecycle";
import type { KitchenStage, OrderRead } from "@/lib/orders/read";

import type { Hold } from "./hold-card";
import type { RefundChoice } from "./refund-panel";

export type PendingHold = Hold & {
    /** What the hold records when it runs out, or on "now". */
    run: () => Promise<void>;
    amount?: number;
};

export type Panel = null | "refund" | "edit" | "courier";

/**
 * What Order Detail does, apart from how it looks: stage moves with their
 * Undo toast, the ten-second holds for Ready and refunds (recorded when they
 * run out, on "now", or when the page is left), refunds by line with one
 * idempotency key per hold, and edits before preparing. Each write is a
 * Server Action; the page re-reads the order after it.
 */
export function useKitchen({
    order,
    first,
    currency,
    format,
    refundTo,
    setPanel,
}: {
    order: OrderRead;
    first: string;
    currency: string;
    format: (n: number) => string;
    refundTo: string;
    setPanel: (p: Panel) => void;
}) {
    const router = useRouter();
    const [hold, setHold] = useState<PendingHold | null>(null);
    const [busy, startTransition] = useTransition();
    const holdRef = useRef<PendingHold | null>(null);

    // Keep the running hold where an unmount can see it.
    useEffect(() => {
        holdRef.current = hold;
    }, [hold]);

    // Leaving the page mid-hold records it now — the card says so — and a
    // tab being closed asks first, since a request may not outlive it.
    useEffect(() => {
        if (!hold) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [hold]);
    useEffect(
        () => () => {
            const h = holdRef.current;
            holdRef.current = null;
            if (h) void h.run();
        },
        [],
    );

    const refresh = useCallback(() => router.refresh(), [router]);

    const undo = useCallback(
        (eventId: string, back: KitchenStage) => {
            startTransition(async () => {
                const res = await undoStage(order.id, eventId);
                if (!res.ok) {
                    showError(res.error);
                    return;
                }
                showInfo(`Back to ${STAGE_LABEL[back].toLowerCase()}.`);
                refresh();
            });
        },
        [order.id, refresh],
    );

    const move = (
        to: KitchenStage,
        extra: { trackingUrl?: string; note?: string } = {},
        said?: string,
    ) =>
        new Promise<void>((resolve) => {
            startTransition(async () => {
                const from = order.stage;
                const res = await moveStage(order.id, { to, ...extra });
                resolve();
                if (!res.ok) {
                    showError(res.error);
                    refresh();
                    return;
                }
                setPanel(null);
                const message =
                    said ??
                    (to === "PREPARING"
                        ? "Preparing. Items are locked now."
                        : `${STAGE_LABEL[to]}.`);
                if (to === "READY") {
                    showSuccess(
                        "Marked ready.",
                        `It shows on the order — nothing was sent to ${first}.`,
                    );
                } else {
                    showUndo(message, () => undo(res.data.eventId, from), {
                        duration: HOLD_MS,
                    });
                }
                refresh();
            });
        });

    const commitHold = () => {
        const h = holdRef.current;
        holdRef.current = null;
        setHold(null);
        if (h) void h.run();
    };

    /** Ready is held ten seconds before it is recorded (ADR-008). */
    const holdReady = () => {
        setPanel(null);
        // Never two Undos: the last step's toast goes as the hold starts.
        dismissToasts();
        setHold({
            kind: "ready",
            until: Date.now() + HOLD_MS,
            run: () => move("READY"),
        });
    };

    /** Undo a hold before it runs out: nothing was recorded. */
    const cancelHold = (said: string) => {
        holdRef.current = null;
        setHold(null);
        showInfo(said);
    };

    const startRefund = (choice: RefundChoice) => {
        const key = crypto.randomUUID();
        setPanel(null);
        dismissToasts();
        setHold({
            kind: "refund",
            until: Date.now() + HOLD_MS,
            amount: choice.amount,
            run: () =>
                new Promise<void>((resolve) => {
                    startTransition(async () => {
                        const res = await refundLines(order.id, {
                            lines: choice.lines,
                            idempotencyKey: key,
                        });
                        resolve();
                        if (!res.ok) {
                            showError(res.error);
                            refresh();
                            return;
                        }
                        const sent =
                            formatMoney(res.data.amountCents, currency) ??
                            format(choice.amount);
                        if (res.data.beingConfirmed) {
                            showInfo(
                                `${refundTo} hasn't confirmed the ${sent} refund yet.`,
                                "The money is held until it answers. Nothing will be sent twice.",
                            );
                            refresh();
                            return;
                        }
                        showSuccess(
                            choice.lines === null
                                ? "Refunded in full."
                                : `Refunded ${sent}. The rest of the order stands.`,
                            order.invoices?.length
                                ? "A credit note is made against its invoice."
                                : undefined,
                        );
                        refresh();
                    });
                }),
        });
    };

    /** Ask again about a refund the provider hasn't answered for. */
    const retryRefund = (refundId: string) => {
        startTransition(async () => {
            const res = await retryRefundAction(order.id, refundId);
            if (!res.ok) {
                showError(res.error);
                refresh();
                return;
            }
            if (res.data.beingConfirmed) {
                showInfo(
                    `Still waiting on ${refundTo}.`,
                    "The money stays held until it answers. Nothing was sent twice.",
                );
            } else {
                showSuccess(`${refundTo} has the refund.`);
            }
            refresh();
        });
    };

    const saveEdit = (input: EditOrderInput) => {
        startTransition(async () => {
            const res = await editBeforePreparing(order.id, input);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setPanel(null);
            const cents = res.data.differenceCents;
            const amount = formatMoney(Math.abs(cents), currency) ?? "";
            if (res.data.moneyError) {
                showError(
                    "Saved, but the money didn't settle.",
                    res.data.moneyError,
                );
            } else {
                showSuccess(
                    cents > 0
                        ? `Saved. ${amount} more is due on the order.`
                        : cents < 0
                          ? `Saved. ${amount} goes back to ${refundTo}.`
                          : "Saved.",
                );
            }
            refresh();
        });
    };

    return {
        hold,
        busy,
        move,
        holdReady,
        commitHold,
        cancelHold,
        startRefund,
        retryRefund,
        saveEdit,
    };
}
