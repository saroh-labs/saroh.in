"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { refundOrder } from "@/lib/payments/actions";

/**
 * Refund control for the owner order view (S5-004). Calls the S5-003 refund
 * endpoint (`payment:manage`); the amount is server-derived from the Order's
 * SUCCEEDED intent. The Order moves to REFUNDED only when the provider's refund
 * webhook reconciles, so on success we report "refund initiated" and refresh.
 */
export function RefundButton({ orderId }: { orderId: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);
    // The confirm action stays clickable during the dialog's exit animation,
    // so a double click can fire this twice before `busy` re-renders.
    const inFlight = useRef(false);

    async function onRefund() {
        if (inFlight.current) return;
        inFlight.current = true;
        setBusy(true);
        try {
            const res = await refundOrder(orderId);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess("Refund initiated — it will settle once confirmed.");
            router.refresh();
        } finally {
            setBusy(false);
            inFlight.current = false;
        }
    }

    return (
        <>
            <Button
                variant="outline"
                onClick={() => setConfirming(true)}
                disabled={busy}
                className="print:hidden"
            >
                {busy ? "Refunding…" : "Refund"}
            </Button>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Refund this order's payment in full?"
                description="The whole payment goes back to the customer. This can't be undone."
                confirmLabel="Refund payment"
                cancelLabel="Keep payment"
                onConfirm={() => void onRefund()}
            />
        </>
    );
}
