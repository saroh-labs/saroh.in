"use client";

import {
    dismissToasts,
    showError,
    showInfo,
    showSuccess,
    showUndo,
    showWarning,
} from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { formatMoney } from "@/lib/format/money";
import {
    editBeforePreparing,
    moveStage,
    recordPayment as recordPaymentAction,
    refundLines,
    retryRefund as retryRefundAction,
    saveCourier as saveCourierAction,
    undoStage,
} from "@/lib/orders/actions";
import type { CourierFields } from "@/lib/orders/courier";
import { OWN_DRIVER, shipmentWords } from "@/lib/orders/courier";
import type {
    CounterPayment,
    EditOrderInput,
} from "@/lib/orders/kitchen-service";
import { HOLD_MS, STAGE_LABEL } from "@/lib/orders/lifecycle";
import type { KitchenStage, OrderRead } from "@/lib/orders/read";

import type { Hold } from "./hold-card";
import type { RefundChoice } from "./refund-panel";

export type PendingHold = Hold & {
    /** What the hold records when it runs out, or on "now". */
    run: () => Promise<void>;
    amount?: number;
    /**
     * Its own words on the hold card (a cancel, B9); a refund's and
     * Ready's are the card's own.
     */
    words?: {
        title: (seconds: number) => string;
        body: string;
        nowLabel: string;
        /** What Undo says: nothing was recorded. */
        undone: string;
    };
};

/**
 * `courier` hands the order over; `tracking` fills in its details after;
 * `fulfilment` and `cancel` are B9's sheets.
 */
export type Panel =
    null | "refund" | "edit" | "courier" | "tracking" | "fulfilment" | "cancel";

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
        extra: CourierFields & { note?: string } = {},
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

    /** Hold another change ten seconds before it is recorded (a cancel). */
    const startHold = (h: PendingHold) => {
        setPanel(null);
        dismissToasts();
        setHold(h);
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
                            putBack: choice.putBack,
                            reason: choice.reason,
                            goodwill: choice.goodwill,
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
                        const back = choice.putBack.reduce(
                            (n, p) => n + p.quantity,
                            0,
                        );
                        const notes = [
                            order.invoices?.length
                                ? "A credit note is made against its invoice."
                                : null,
                            back > 0
                                ? `${back} go${back === 1 ? "es" : ""} back in stock when ${refundTo} confirms it.`
                                : null,
                        ].filter((n): n is string => n !== null);
                        showSuccess(
                            choice.lines === null && !choice.goodwill
                                ? "Refunded in full."
                                : `Refunded ${sent}. The rest of the order stands.`,
                            notes.length > 0 ? notes.join(" ") : undefined,
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

    /**
     * Hand it to the courier with whatever of their details are known now
     * (all optional, B10). Nothing is sent to the customer.
     */
    const handOver = (fields: CourierFields) => {
        const courier = fields.courierName ?? null;
        const said =
            courier === OWN_DRIVER
                ? "Out with your own driver."
                : courier
                  ? `Handed to ${shipmentWords({ courier, number: fields.trackingNumber ?? null })}.`
                  : "Handed to the courier.";
        const later =
            courier !== OWN_DRIVER && !fields.trackingNumber
                ? " Add the tracking number when you have it."
                : "";
        return move("HANDED_TO_COURIER", fields, `${said}${later}`);
    };

    /** Fill in or correct the courier's details after the handover. */
    const saveCourier = (fields: CourierFields) => {
        if (Object.keys(fields).length === 0) {
            setPanel(null);
            return;
        }
        startTransition(async () => {
            const res = await saveCourierAction(order.id, fields);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setPanel(null);
            showSuccess(
                fields.trackingNumber
                    ? "Tracking number saved."
                    : "Tracking details saved.",
                `It stays on the order — nothing is sent to ${first}.`,
            );
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
            const d = res.data;
            const money = (c: number) =>
                formatMoney(Math.abs(c), currency) ?? "";
            // What is still owed, and what goes back (online, or from the
            // till for what was paid by hand). An API before the audit of
            // 6 Oct 2026 sends only `settleCents`.
            const due = d.dueCents ?? Math.max(0, d.settleCents);
            const fromTill = d.handBackCents ?? 0;
            const online = d.settleCents < 0 ? -d.settleCents - fromTill : 0;
            const record = "Record it on the order when you're paid.";
            if (due > 0) {
                if (d.moneyError) {
                    // The edit stands and the money is still owed; asking
                    // for it online didn't start. Nothing was lost.
                    showWarning(
                        `Saved. ${money(due)} more is due.`,
                        `It couldn't be asked for online: ${d.moneyError} ${record}`,
                    );
                } else {
                    showSuccess(
                        `Saved. ${money(due)} more is due.`,
                        d.online === false ? record : undefined,
                    );
                }
            } else if (d.moneyError && online > 0) {
                showError(
                    `Saved, but the ${money(online)} refund didn't go through.`,
                    d.moneyError,
                );
            } else if (fromTill > 0 && online > 0) {
                showSuccess(
                    `Saved. ${money(online)} goes back to ${refundTo}, and ${money(fromTill)} from the till.`,
                );
            } else if (fromTill > 0) {
                showSuccess(
                    `Saved. Give ${money(fromTill)} back from the till.`,
                );
            } else if (online > 0) {
                showSuccess(
                    `Saved. ${money(online)} goes back to ${refundTo}.`,
                );
            } else {
                showSuccess("Saved.");
            }
            refresh();
        });
    };

    /**
     * "Record payment": what the order still owes — an edit's difference —
     * was paid at the counter. The API works out the amount.
     */
    const recordPayment = (kind: CounterPayment) => {
        startTransition(async () => {
            const res = await recordPaymentAction(order.id, kind);
            if (!res.ok) {
                showError(res.error);
                refresh();
                return;
            }
            const how =
                kind === "CASH"
                    ? "in cash"
                    : kind === "UPI"
                      ? "by UPI"
                      : "by card";
            showSuccess(
                `${formatMoney(res.data.amountCents, currency) ?? ""} recorded, paid ${how}.`,
                "Nothing more is due on the order.",
            );
            refresh();
        });
    };

    return {
        hold,
        busy,
        move,
        recordPayment,
        holdReady,
        commitHold,
        cancelHold,
        startHold,
        startRefund,
        retryRefund,
        saveEdit,
        handOver,
        saveCourier,
    };
}
