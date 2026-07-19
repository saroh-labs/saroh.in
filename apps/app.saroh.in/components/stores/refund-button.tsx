"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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

    async function onRefund() {
        if (
            !window.confirm(
                "Refund this order's payment in full? This can't be undone.",
            )
        ) {
            return;
        }
        setBusy(true);
        const res = await refundOrder(orderId);
        setBusy(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Refund initiated — it will settle once confirmed.");
        router.refresh();
    }

    return (
        <button
            type="button"
            onClick={onRefund}
            disabled={busy}
            className="h-9 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
            {busy ? "Refunding…" : "Refund"}
        </button>
    );
}
