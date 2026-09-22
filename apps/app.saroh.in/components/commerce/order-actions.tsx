"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { showError, showSuccess } from "@saroh/ui/toast";
import { MoreHorizontal, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { updateOrder } from "@/lib/orders/actions";
import type { Step } from "@/lib/orders/lifecycle";
import {
    canCancel,
    nextStep,
    PAYMENT_LABEL,
    PAYMENT_TRANSITIONS,
} from "@/lib/orders/lifecycle";
import type { OrderStatus, PaymentStatus } from "@/lib/orders/service";

type Pending =
    | { kind: "step"; step: Step }
    | { kind: "cancel" }
    | { kind: "payment"; to: PaymentStatus };

/**
 * What can be done to an order from its header: the next step for its goods,
 * printing it, and — in the menu — cancelling it or recording a payment by
 * hand. Every move is forward-only on the server, so each one asks first.
 */
export function OrderActions({
    storeId,
    orderId,
    orderRef,
    status,
    paymentStatus,
}: {
    storeId: string;
    orderId: string;
    orderRef: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
}) {
    const router = useRouter();
    const [pending, setPending] = useState<Pending | null>(null);
    const [busy, setBusy] = useState(false);
    const step = nextStep(status);
    // Recording a payment by hand is for money that moved outside Saroh —
    // cash, a bank transfer. A card refund goes through Refund instead, which
    // actually sends the money back.
    const paymentMoves = PAYMENT_TRANSITIONS[paymentStatus];

    async function commit(p: Pending) {
        setBusy(true);
        const res = await updateOrder(
            storeId,
            orderId,
            p.kind === "payment"
                ? { paymentStatus: p.to }
                : { status: p.kind === "cancel" ? "CANCELLED" : p.step.to },
        );
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(
            p.kind === "cancel"
                ? `${orderRef} cancelled — its stock is back on the shelves`
                : p.kind === "payment"
                  ? `${orderRef} marked ${PAYMENT_LABEL[p.to].toLowerCase()}`
                  : `${orderRef}: ${p.step.label.toLowerCase()} done`,
        );
        router.refresh();
    }

    const confirm = pending ? confirmCopy(pending) : null;

    return (
        <>
            <Button
                variant="outline"
                onClick={() => window.print()}
                className="print:hidden"
            >
                <Printer className="mr-1.5 size-4" />
                Print
            </Button>
            {canCancel(status) || paymentMoves.length > 0 ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            className="print:hidden"
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
            {step ? (
                <Button
                    className="print:hidden"
                    disabled={busy}
                    onClick={() => setPending({ kind: "step", step })}
                >
                    {step.label}
                </Button>
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
    if (p.kind === "step") {
        return { title: p.step.title, body: p.step.body, verb: p.step.label };
    }
    if (p.kind === "cancel") {
        return {
            title: "Cancel this order?",
            body: "Its reserved stock goes back on the shelves. A cancelled order stays in the list, and it cannot be reopened.",
            verb: "Cancel order",
        };
    }
    const bodies: Record<PaymentStatus, string> = {
        PAID: "For a payment taken outside Saroh — cash, or a bank transfer. Nothing is charged.",
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
