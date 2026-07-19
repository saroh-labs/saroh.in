import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderPayments } from "@/components/stores/order-payments";
import { OrderStatusControls } from "@/components/stores/order-status-controls";
import { getOrder } from "@/lib/orders/service";
import { getOrderPayments } from "@/lib/payments/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

export default async function OrderDetailPage({
    params,
}: {
    params: Promise<{ storeId: string; orderId: string }>;
}) {
    const { storeId, orderId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const order = await getOrder(storeId, orderId);
    if (!order) notFound();

    const payments = await getOrderPayments(order.id);

    const cur = order.currency;

    return (
        <div className="space-y-6">
            <Link
                href={`/stores/${storeId}/orders`}
                className="text-sm text-muted-foreground hover:underline"
            >
                ← Back to orders
            </Link>

            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-medium">{order.orderId}</h2>
                    <p className="text-sm text-muted-foreground">
                        {order.customer?.email ?? "—"}
                    </p>
                </div>
                <OrderStatusControls
                    storeId={storeId}
                    orderId={order.id}
                    status={order.status}
                    paymentStatus={order.paymentStatus}
                />
            </div>

            <div className="rounded-lg border">
                <ul className="divide-y">
                    {order.items.map((item) => (
                        <li
                            key={item.id}
                            className="flex items-center justify-between gap-3 p-3 text-sm"
                        >
                            <span>
                                {item.product?.name ?? item.productId}
                                <span className="text-muted-foreground">
                                    {" "}
                                    × {item.quantity}
                                </span>
                            </span>
                            <span className="tabular-nums">
                                {cur} {item.price}
                            </span>
                        </li>
                    ))}
                </ul>
                <div className="space-y-1 border-t p-3">
                    <Row label="Subtotal" value={`${cur} ${order.subtotal}`} />
                    <Row label="Tax" value={`${cur} ${order.tax}`} />
                    <Row label="Shipping" value={`${cur} ${order.shipping}`} />
                    <Row
                        label="Discount"
                        value={`− ${cur} ${order.discount}`}
                    />
                    <div className="flex justify-between border-t pt-1 text-sm font-semibold">
                        <span>Total</span>
                        <span className="tabular-nums">
                            {cur} {order.total}
                        </span>
                    </div>
                </div>
            </div>

            <OrderPayments orderId={order.id} summary={payments} />
        </div>
    );
}
