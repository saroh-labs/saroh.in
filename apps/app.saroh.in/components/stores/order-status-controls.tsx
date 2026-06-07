"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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
            toast.error(res.error);
            return;
        }
        toast.success("Order updated");
        router.refresh();
    }

    return (
        <div className="flex flex-wrap gap-4">
            <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                    Fulfilment
                </span>
                <select
                    aria-label="Order status"
                    value={status}
                    disabled={busy}
                    onChange={(e) =>
                        change({ status: e.target.value as OrderStatus })
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                    {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>
            </div>
            <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Payment</span>
                <select
                    aria-label="Payment status"
                    value={paymentStatus}
                    disabled={busy}
                    onChange={(e) =>
                        change({
                            paymentStatus: e.target.value as PaymentStatus,
                        })
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                    {PAYMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
