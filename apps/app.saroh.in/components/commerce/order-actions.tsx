"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { showError, showSuccess } from "@saroh/ui/toast";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";

import { useGstRateStep } from "@/components/gst-rates/use-gst-rate-step";
import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { PaymentMethod } from "@/lib/invoices/service";
import { updateOrder } from "@/lib/orders/actions";
import { handRefundDone } from "@/lib/orders/hand-refund";
import {
    canCancel,
    PAYMENT_LABEL,
    PAYMENT_TRANSITIONS,
} from "@/lib/orders/lifecycle";
import type { OrderStatus, PaymentStatus } from "@/lib/orders/service";

import { IconButton } from "@saroh/ui/icon-button";
import { RecordPaidDialog } from "./record-paid-dialog";

/** Said where recording a payment stopped at the GST rate ask. */
const RATE_NOT_CHOSEN =
    "Not recorded. Choose the GST rate to record this payment.";

type Pending =
    | { kind: "cancel" }
    // `how`: a way already known when it opens ("Paid in cash", #834).
    | { kind: "payment"; to: PaymentStatus; how?: PaymentMethod };
export type { Pending as OrderMenuPending };

/**
 * The order header's menu: cancelling it, or recording a payment by hand.
 * Both are forward-only on the server, so each one asks first. The goods move
 * through the kitchen stepper instead (ADR-008), which has an Undo.
 *
 * `pending` can be opened from outside — the payment banner's "Paid in cash"
 * asks the same question as the menu's "Record as paid", with Cash picked.
 * Recording it paid asks how it was paid (#834).
 */
export function OrderActions({
    storeId,
    orderId,
    orderRef,
    status,
    paymentStatus,
    pending,
    onPendingChange,
    withCancel = true,
    canRecord = true,
    canRefund = true,
    refundLeft,
    format,
    currency,
}: {
    storeId: string;
    orderId: string;
    orderRef: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    pending: Pending | null;
    onPendingChange: (p: Pending | null) => void;
    /**
     * Offer "Cancel order" here: only against an API before B9. From B9 it
     * is "Cancel order…" on the Change card, a refund in full.
     */
    withCancel?: boolean;
    /** Record a payment by hand (`order:edit`, B16). */
    canRecord?: boolean;
    /**
     * Cancel, or record money handed back (`order:refund`, B16). Without it
     * neither is drawn: the API would refuse them.
     */
    canRefund?: boolean;
    /**
     * What is left to refund, in major units (#865): with `format`, Record
     * as refunded offers another amount up to it.
     */
    refundLeft?: number;
    format?: (amount: number) => string;
    /** The order's currency, for the amount box. */
    currency?: string;
}) {
    const router = useRouter();
    const setPending = onPendingChange;
    const rates = useGstRateStep({
        then: "record this payment",
        continueLabel: "Save and record payment",
    });
    // Recording a payment by hand is for money that moved outside Saroh —
    // cash, a bank transfer. A card refund goes through Refund instead, which
    // actually sends the money back. Each move is offered only to someone
    // whose role the API would let make it.
    const paymentMoves = PAYMENT_TRANSITIONS[paymentStatus].filter((to) =>
        to === "REFUNDED" ? canRefund : canRecord,
    );
    const cancellable = withCancel && canRefund && canCancel(status);

    /** Resolves with the refusal's reason, for the dialog that asked. */
    async function commit(
        p: Pending,
        how?: PaymentMethod,
        amount?: string,
    ): Promise<{ ok: true } | { ok: false; error: string }> {
        // Recorded as paid with an item that has no GST rate: the rate is
        // chosen here and saved to the item, then it is recorded as asked.
        const res = await rates.run(() =>
            updateOrder(
                storeId,
                orderId,
                p.kind === "payment"
                    ? {
                          paymentStatus: p.to,
                          ...(how
                              ? p.to === "REFUNDED"
                                  ? { refundedHow: how }
                                  : { paidHow: how }
                              : {}),
                          // Another amount handed back (#865).
                          ...(p.to === "REFUNDED" && amount
                              ? { refundAmount: amount }
                              : {}),
                      }
                    : { status: "CANCELLED" },
            ),
        );
        // The rate wasn't chosen: nothing was recorded, and the dialog
        // that asked stays open with what was picked.
        if (!res) return { ok: false, error: RATE_NOT_CHOSEN };
        if (!res.ok) return { ok: false, error: res.error };
        // In part, the order stays paid: the toast says how much went back.
        const part =
            amount !== undefined &&
            format !== undefined &&
            (refundLeft === undefined || Number(amount) < refundLeft)
                ? Number(amount)
                : null;
        showSuccess(
            p.kind === "cancel"
                ? `${orderRef} cancelled. Its stock is back on the shelves.`
                : p.to === "REFUNDED" && format
                  ? handRefundDone(orderRef, part, format)
                  : `${orderRef} marked ${PAYMENT_LABEL[p.to].toLowerCase()}.`,
        );
        router.refresh();
        return { ok: true };
    }

    // Marking it paid asks how (#834), and is not destructive.
    // Recording it refunded asks how it went back, the same way (UX-061).
    const recordingPaid =
        pending?.kind === "payment" &&
        (pending.to === "PAID" || pending.to === "REFUNDED")
            ? pending
            : null;
    const confirm =
        pending && !recordingPaid ? confirmCopy(pending, paymentStatus) : null;

    return (
        <>
            {cancellable || paymentMoves.length > 0 ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <IconButton
                            label={`More actions for ${orderRef}`}
                            icon={<MoreHorizontal />}
                            variant="outline"
                            size="md"
                            className="print:hidden"
                        />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                        {paymentMoves.map((to) => (
                            <DropdownMenuItem
                                key={to}
                                onSelect={() =>
                                    setPending({ kind: "payment", to })
                                }
                            >
                                Record as {PAYMENT_LABEL[to].toLowerCase()}
                            </DropdownMenuItem>
                        ))}
                        {cancellable ? (
                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => setPending({ kind: "cancel" })}
                            >
                                Cancel order
                            </DropdownMenuItem>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
            {recordingPaid ? (
                <RecordPaidDialog
                    open
                    onOpenChange={(open) => {
                        if (!open) setPending(null);
                    }}
                    initial={recordingPaid.how}
                    refund={recordingPaid.to === "REFUNDED"}
                    left={refundLeft}
                    format={format}
                    currency={currency}
                    onRecord={async (how, amount) => {
                        const res = await commit(recordingPaid, how, amount);
                        if (!res.ok) showError(res.error);
                        return res.ok;
                    }}
                />
            ) : null}
            {rates.step}
            {confirm ? (
                <ConfirmDialog
                    open
                    onOpenChange={(open) => {
                        if (!open) setPending(null);
                    }}
                    title={confirm.title}
                    description={confirm.body}
                    confirmLabel={confirm.verb}
                    keepLabel={confirm.keep}
                    tone={confirm.tone}
                    onConfirm={(): Promise<ConfirmResult> | undefined =>
                        pending ? commit(pending) : undefined
                    }
                />
            ) : null}
        </>
    );
}

function confirmCopy(
    p: Pending,
    now: PaymentStatus,
): {
    title: string;
    body: string;
    verb: string;
    /** The way out: never "Cancel" beside "Cancel order". */
    keep: string;
    /** Red only for the cancel: recording a payment destroys nothing. */
    tone: "destructive" | "neutral";
} {
    if (p.kind === "cancel") {
        return {
            title: "Cancel this order?",
            body: "Its reserved stock goes back on the shelves. A cancelled order stays in the list. This cannot be undone.",
            verb: "Cancel order",
            keep: "Keep order",
            tone: "destructive",
        };
    }
    const bodies: Record<PaymentStatus, string> = {
        // Asked by RecordPaidDialog instead (#834).
        PAID: "",
        FAILED: "The customer tried to pay and it did not go through. They can still pay later.",
        REFUNDED:
            "For money returned outside Saroh. Nothing is sent back from here. To refund a card payment, use Refund.",
        UNPAID: "",
    };
    return {
        title: `Record this order as ${PAYMENT_LABEL[p.to].toLowerCase()}?`,
        body: `${bodies[p.to]} This cannot be undone.`,
        verb: `Record as ${PAYMENT_LABEL[p.to].toLowerCase()}`,
        keep: `Keep it ${PAYMENT_LABEL[now].toLowerCase()}`,
        tone: "neutral",
    };
}
