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
import { updateOrder } from "@/lib/orders/actions";
import {
    canCancel,
    PAYMENT_LABEL,
    PAYMENT_TRANSITIONS,
} from "@/lib/orders/lifecycle";
import type { OrderStatus, PaymentStatus } from "@/lib/orders/service";

type Pending = { kind: "cancel" } | { kind: "payment"; to: PaymentStatus };
export type { Pending as OrderMenuPending };

/**
 * The order header's menu: cancelling it, or recording a payment by hand.
 * Both are forward-only on the server, so each one asks first. The goods move
 * through the kitchen stepper instead (ADR-008), which has an Undo.
 *
 * `pending` can be opened from outside — the payment banner's "Paid in cash"
 * asks the same question as the menu's "Record as paid".
 */
export function OrderActions({
    storeId,
    orderId,
    orderRef,
    status,
    paymentStatus,
    pending,
    onPendingChange,
}: {
    storeId: string;
    orderId: string;
    orderRef: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    pending: Pending | null;
    onPendingChange: (p: Pending | null) => void;
}) {
    const router = useRouter();
    const setPending = onPendingChange;
    // Recording a payment by hand is for money that moved outside Saroh —
    // cash, a bank transfer. A card refund goes through Refund instead, which
    // actually sends the money back.
    const paymentMoves = PAYMENT_TRANSITIONS[paymentStatus];

    async function commit(p: Pending) {
        const res = await updateOrder(
            storeId,
            orderId,
            p.kind === "payment"
                ? { paymentStatus: p.to }
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

    const confirm = pending ? confirmCopy(pending) : null;

    return (
        <>
            {canCancel(status) || paymentMoves.length > 0 ? (
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
                        {canCancel(status) ? (
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
        PAID: "For a payment taken outside Saroh — cash, or a bank transfer. Nothing is charged, and nothing is sent to the customer.",
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
