"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { showError, showSuccess } from "@saroh/ui/toast";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { PaymentMethod } from "@/lib/invoices/service";
import { updateOrder } from "@/lib/orders/actions";
import {
    canCancel,
    PAYMENT_LABEL,
    PAYMENT_TRANSITIONS,
} from "@/lib/orders/lifecycle";
import type { OrderStatus, PaymentStatus } from "@/lib/orders/service";

import { RecordPaidDialog } from "./record-paid-dialog";

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
}) {
    const router = useRouter();
    const setPending = onPendingChange;
    // Recording a payment by hand is for money that moved outside Saroh —
    // cash, a bank transfer. A card refund goes through Refund instead, which
    // actually sends the money back. Each move is offered only to someone
    // whose role the API would let make it.
    const paymentMoves = PAYMENT_TRANSITIONS[paymentStatus].filter((to) =>
        to === "REFUNDED" ? canRefund : canRecord,
    );
    const cancellable = withCancel && canRefund && canCancel(status);

    async function commit(p: Pending, how?: PaymentMethod) {
        const res = await updateOrder(
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
                  }
                : { status: "CANCELLED" },
        );
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(
            p.kind === "cancel"
                ? `${orderRef} cancelled — its stock is back on the shelves`
                : `${orderRef} marked ${PAYMENT_LABEL[p.to].toLowerCase()}`,
        );
        router.refresh();
    }

    // Marking it paid asks how (#834), and is not destructive.
    // Recording it refunded asks how it went back, the same way (UX-061).
    const recordingPaid =
        pending?.kind === "payment" &&
        (pending.to === "PAID" || pending.to === "REFUNDED")
            ? pending
            : null;
    const confirm = pending && !recordingPaid ? confirmCopy(pending) : null;

    return (
        <>
            {cancellable || paymentMoves.length > 0 ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-[38px] rounded-[9px] bg-card coarse:size-11 print:hidden"
                            aria-label={`More actions for ${orderRef}`}
                        >
                            <MoreHorizontal className="size-4" />
                        </Button>
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
                    onRecord={(how) => {
                        setPending(null);
                        void commit(recordingPaid, how);
                    }}
                />
            ) : null}
            {confirm ? (
                <ConfirmDialog
                    open
                    onOpenChange={(open) => {
                        if (!open) setPending(null);
                    }}
                    title={confirm.title}
                    description={confirm.body}
                    confirmLabel={confirm.verb}
                    cancelLabel="Not yet"
                    onConfirm={() => {
                        const p = pending;
                        setPending(null);
                        if (p) void commit(p);
                    }}
                />
            ) : null}
        </>
    );
}

function confirmCopy(p: Pending): {
    title: string;
    body: string;
    verb: string;
} {
    if (p.kind === "cancel") {
        return {
            title: "Cancel this order?",
            body: "Its reserved stock goes back on the shelves. A cancelled order stays in the list, and it cannot be reopened.",
            verb: "Cancel order",
        };
    }
    const bodies: Record<PaymentStatus, string> = {
        // Asked by RecordPaidDialog instead (#834).
        PAID: "",
        FAILED: "The customer tried to pay and it did not go through. They can still pay later.",
        REFUNDED:
            "For money returned outside Saroh. Nothing is sent back from here — to refund a card payment, use Refund.",
        UNPAID: "",
    };
    return {
        title: `Record this order as ${PAYMENT_LABEL[p.to].toLowerCase()}?`,
        body: `${bodies[p.to]} This cannot be taken back.`,
        verb: `Record as ${PAYMENT_LABEL[p.to].toLowerCase()}`,
    };
}
