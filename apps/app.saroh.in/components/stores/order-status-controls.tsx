"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { updateOrder } from "@/lib/orders/actions";
import type { OrderStatus, PaymentStatus } from "@/lib/orders/service";

const ORDER_STATUSES: OrderStatus[] = [
    "PENDING",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
];
const PAYMENT_STATUSES: PaymentStatus[] = [
    "UNPAID",
    "PAID",
    "FAILED",
    "REFUNDED",
];

/**
 * Order + payment status pickers. Changing fulfilment status drives the
 * inventory transition server-side (reserve → commit → release); the merchant
 * sets payment status manually (no real charges in v1).
 */
export function OrderStatusControls({
    storeId,
    orderId,
    status,
    paymentStatus,
}: {
    storeId: string;
    orderId: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function change(input: {
        status?: OrderStatus;
        paymentStatus?: PaymentStatus;
    }) {
        setBusy(true);
        const res = await updateOrder(storeId, orderId, input);
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("Order updated");
        router.refresh();
    }

    return (
        <div className="flex flex-wrap gap-4">
            <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                    Fulfilment
                </span>
                <OptionSelect
                    aria-label="Order status"
                    value={status}
                    disabled={busy}
                    onValueChange={(v) => {
                        void change({ status: v });
                    }}
                    options={ORDER_STATUSES.map((s) => ({
                        value: s,
                        label: s,
                    }))}
                    className="w-44"
                />
            </div>
            <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Payment</span>
                <OptionSelect
                    aria-label="Payment status"
                    value={paymentStatus}
                    disabled={busy}
                    onValueChange={(v) => {
                        void change({ paymentStatus: v });
                    }}
                    options={PAYMENT_STATUSES.map((s) => ({
                        value: s,
                        label: s,
                    }))}
                    className="w-44"
                />
            </div>
        </div>
    );
}
