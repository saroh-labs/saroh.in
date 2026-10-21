"use client";

import { showError, showInfo, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { formatMoney } from "@/lib/format/money";
import { cancelOrder, changeFulfilment } from "@/lib/orders/actions";
import type { ChangeFulfilmentInput } from "@/lib/orders/kitchen-service";
import { HOLD_MS } from "@/lib/orders/lifecycle";
import type { OrderRead } from "@/lib/orders/read";

import { runAction } from "@/lib/api/run-action";
import type { CancelChoice } from "./cancel-panel";
import type { Panel, PendingHold } from "./use-kitchen";

/**
 * Order Detail's two changes after it was placed (round-2 B9): how it is
 * fulfilled, saved at once, and a cancel, held ten seconds like a refund
 * (it is one) before it is recorded. Each write is a Server Action; the
 * page re-reads the order after it.
 */
export function useOrderChanges({
    order,
    first,
    currency,
    refundTo,
    setPanel,
    startHold,
    onOwed,
}: {
    order: OrderRead;
    first: string;
    currency: string;
    refundTo: string;
    setPanel: (p: Panel) => void;
    startHold: (h: PendingHold) => void;
    /** More is owed after a change: make the payment link for it (B11). */
    onOwed?: () => void;
}) {
    const router = useRouter();
    const [busy, startTransition] = useTransition();
    const money = (cents: number) => formatMoney(Math.abs(cents), currency);
    const told = (yes: boolean) =>
        yes
            ? `${first} has been told in their messages.`
            : `Nothing was sent to ${first}.`;

    const saveFulfilment = (input: ChangeFulfilmentInput, label: string) => {
        startTransition(async () => {
            const res = await runAction(() =>
                changeFulfilment(order.id, {
                    ...input,
                    idempotencyKey: crypto.randomUUID(),
                }),
            );
            if (!res) return;
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setPanel(null);
            const d = res.data;
            const now = `Now ${label.toLowerCase()}.`;
            if (d.moneyError && d.settleCents < 0) {
                // The change stands; the refund didn't go (U5). Say so, and
                // where to send it again.
                showError(
                    `${now} The ${money(d.settleCents)} refund didn't go through.`,
                    `${/[.!?]$/.test(d.moneyError) ? d.moneyError : `${d.moneyError}.`} To try again, use Refund… on this order with that amount.`,
                );
            } else if (d.moneyError) {
                showError(`${now} The money didn't settle.`, d.moneyError);
            } else if (d.settleCents > 0) {
                showSuccess(
                    `${now} ${money(d.settleCents)} more is due.`,
                    told(d.told),
                );
                onOwed?.();
            } else if (d.settleCents < 0) {
                showSuccess(
                    `${now} ${money(d.settleCents)} goes back to ${refundTo}.`,
                    told(d.told),
                );
            } else if (d.byHand && d.differenceCents !== 0) {
                showSuccess(
                    d.differenceCents > 0
                        ? `${now} Take ${money(d.differenceCents)} more at the counter.`
                        : `${now} Give ${money(d.differenceCents)} back from the till.`,
                    told(d.told),
                );
            } else {
                showSuccess(now, told(d.told));
            }
            router.refresh();
        });
    };

    /**
     * Cancel as a refund in full, held ten seconds first. `amount` is what
     * the screen expects to go back (major units); the API works it out.
     */
    const startCancel = (
        choice: CancelChoice,
        amount: number,
        format: ((n: number) => string) | null,
    ) => {
        const key = crypto.randomUUID();
        const said = amount > 0 && format ? format(amount) : null;
        startHold({
            kind: "refund",
            until: Date.now() + HOLD_MS,
            amount,
            words: {
                title: (s) =>
                    said
                        ? `Cancelling and refunding ${said} in ${s}s`
                        : `Cancelling in ${s}s`,
                body: said
                    ? `Back to ${refundTo}. Once it goes, money can only come back as a new charge.`
                    : "It stays in Orders as cancelled, and can't be reopened.",
                nowLabel: said ? "Refund now" : "Cancel now",
                undone: said
                    ? "Not cancelled. Nothing was sent back."
                    : "Not cancelled.",
            },
            run: () =>
                new Promise<void>((resolve) => {
                    startTransition(async () => {
                        const res = await runAction(() =>
                            cancelOrder(order.id, {
                                reason: choice.reason,
                                idempotencyKey: key,
                                tell: choice.tell,
                            }),
                        );
                        resolve();
                        if (!res) {
                            // The reply may have been lost after it went.
                            router.refresh();
                            return;
                        }
                        if (!res.ok) {
                            showError(res.error);
                            router.refresh();
                            return;
                        }
                        const d = res.data;
                        if (d.refund?.partlyRefused) {
                            showError(
                                "Part of the refund was refused, so the order isn't cancelled.",
                                "What went back stays back. Cancel again to send the rest.",
                            );
                        } else if (!d.cancelled) {
                            showInfo(
                                `${refundTo} hasn't confirmed the refund yet.`,
                                "The order is cancelled once it does. Nothing will be sent twice.",
                            );
                        } else if (d.byHand) {
                            showSuccess(
                                `Order cancelled. Give ${money(d.byHand.amountCents)} back from the till.`,
                                told(d.told),
                            );
                        } else {
                            showSuccess(
                                d.refund
                                    ? "Order cancelled and refunded. It stays in Orders as cancelled."
                                    : "Order cancelled. It stays in Orders as cancelled.",
                                told(d.told),
                            );
                        }
                        router.refresh();
                    });
                }),
        });
    };

    return { busy, saveFulfilment, startCancel };
}
