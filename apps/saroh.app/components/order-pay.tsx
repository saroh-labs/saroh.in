"use client";

import type { OpenCheckout } from "@saroh/site-blocks";
import {
    hasPayInstructions,
    PayInstructionsCard,
    PayLinkPay,
    payWaysText,
} from "@saroh/site-blocks";
import { cn } from "@saroh/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { startPayment } from "@/app/pay/o/[token]/actions";
import { payMoney } from "@/lib/invoice-pay-shape";
import type { PayOrder } from "@/lib/order-pay";
import { orderPayOffer } from "@/lib/order-pay-shape";

/**
 * The order a pay link shows, and its Pay button (plan B, B11).
 *
 * Only what the API's allow-list sends is on the page: the business, the
 * order's number, its lines and total, what is due, and the customer's
 * first name. The Pay button starts an intent for what is due and opens
 * the business's provider window on it, as the bag and the booking page do
 * (`PayLinkPay`, over the one shared `openProviderCheckout`). The page never
 * claims a payment went through: after the window it re-reads the order
 * until the server says paid, and "Check again" does the same by hand.
 *
 * When the business can't take it online (`payOnline` false, R33 — a link
 * made before its plan changed, say), the page is view-only: the order,
 * what's left to pay and "Pay ‹business› directly", with no Pay button.
 * While it is due, the business's own way to be paid offline, where it set
 * one (R32, {@link OrderPayInstructions}): its UPI ID as a QR for what is
 * due, its bank details and its note.
 *
 * Styled in the business's `--site-*` tokens, never Saroh's brand. Status is
 * an opaque fill with its own foreground: the page ground is the
 * merchant's, so a tint cannot be trusted against it.
 */
export function OrderPay({
    token,
    order,
    apiUrl,
    openCheckout,
}: {
    token: string;
    order: PayOrder;
    /** Where the provider window's return is posted (P1). */
    apiUrl?: string;
    /** The provider window; replaced in tests. */
    openCheckout?: OpenCheckout;
}) {
    const router = useRouter();
    const start = useCallback(
        (idempotencyKey: string) => startPayment(token, idempotencyKey),
        [token],
    );
    const refresh = useCallback(() => router.refresh(), [router]);

    const money = (a: string) => payMoney(a, order.currency);
    const offer = orderPayOffer(order);
    const partPaid =
        order.status === "DUE" && Number(order.due) < Number(order.total);

    return (
        <section className="mx-auto w-full max-w-xl px-5 py-12 sm:px-8 sm:py-16">
            <h1 className="text-2xl font-bold tracking-tight text-site-fg [overflow-wrap:anywhere]">
                {order.businessName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-site-body">
                    Order #{order.orderNumber}
                </h2>
                <StatusBadge status={order.status} />
            </div>
            {order.firstName ? (
                <p className="mt-2 text-sm text-site-body">
                    For {order.firstName}
                </p>
            ) : null}

            <div className="mt-8 overflow-x-auto rounded-xl border border-site-border">
                <table className="w-full min-w-[320px] text-sm">
                    <thead>
                        <tr className="border-b border-site-border text-left text-xs text-site-muted">
                            <th className="px-4 py-2.5 font-medium">Item</th>
                            <th className="px-4 py-2.5 text-right font-medium">
                                Qty
                            </th>
                            <th className="px-4 py-2.5 text-right font-medium">
                                Amount
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {order.lines.map((l, i) => (
                            <tr
                                key={`${i}-${l.name}`}
                                className="border-b border-site-border text-site-body"
                            >
                                <td className="px-4 py-3">
                                    {l.name}
                                    {l.quantity > 1 ? (
                                        <span className="block text-xs text-site-muted">
                                            {money(l.unitPrice)} each
                                        </span>
                                    ) : null}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                    {l.quantity}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                    {money(l.amount)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="text-base font-semibold text-site-fg">
                            <td
                                colSpan={2}
                                className="px-4 pb-3 pt-3 text-right"
                            >
                                Total
                            </td>
                            <td className="px-4 pb-3 pt-3 text-right tabular-nums">
                                {money(order.total)}
                            </td>
                        </tr>
                        {partPaid ? (
                            <tr className="text-site-fg">
                                <td
                                    colSpan={2}
                                    className="px-4 pb-3 text-right"
                                >
                                    Left to pay
                                </td>
                                <td className="px-4 pb-3 text-right tabular-nums">
                                    {money(order.due)}
                                </td>
                            </tr>
                        ) : null}
                    </tfoot>
                </table>
            </div>

            {offer === "elsewhere" ? (
                <PayDirectly
                    businessName={order.businessName}
                    due={money(order.due)}
                />
            ) : offer === "pay" ? (
                <div className="mt-6">
                    <PayLinkPay
                        start={start}
                        refresh={refresh}
                        amount={money(order.due)}
                        businessName={order.businessName}
                        description={`Order #${order.orderNumber}`}
                        payerName={order.firstName}
                        apiUrl={apiUrl}
                        openCheckout={openCheckout}
                    />
                </div>
            ) : (
                <div className="mt-6 rounded-xl border border-site-border bg-site-surface p-5 text-center">
                    <p className="text-site-fg">
                        {order.status === "PAID"
                            ? "Already paid. Thank you, there's nothing more to do."
                            : `This order can't be paid any more. If you think that's a mistake, ask ${order.businessName}.`}
                    </p>
                </div>
            )}
            {/* With Pay offered these are the other ways; on the view-only
                page (R33) they are the way. */}
            <OrderPayInstructions
                order={order}
                online={offer === "pay"}
                className="mt-6"
            />
        </section>
    );
}

/**
 * The view-only page's ask (R33): pay the business directly. Its "How to
 * pay us" card follows it when it set one (`OrderPayInstructions`). No
 * button: nothing here takes money.
 */
function PayDirectly({
    businessName,
    due,
}: {
    businessName: string;
    due: string;
}) {
    return (
        <div
            role="status"
            className="mt-6 rounded-xl border border-site-border bg-site-surface p-5 text-center"
        >
            <p className="font-semibold text-site-fg">
                Pay {businessName} directly
            </p>
            <p className="mt-1 text-sm text-site-muted">
                {businessName} doesn&apos;t take payment online here. {due} is
                left to pay.
            </p>
        </div>
    );
}

/**
 * "How to pay us" (R32) on a due order: nothing when the business set none
 * or nothing is due. `online`: the page offers Pay too, so these are the
 * other ways; without it (an order the business can't take online), they
 * are the way.
 */
export function OrderPayInstructions({
    order,
    online,
    className,
}: {
    order: PayOrder;
    online: boolean;
    className?: string;
}) {
    if (order.status !== "DUE" || !hasPayInstructions(order.payInstructions)) {
        return null;
    }
    const ways = payWaysText(order.payInstructions);
    const due = payMoney(order.due, order.currency);
    return (
        <PayInstructionsCard
            instructions={order.payInstructions}
            businessName={order.businessName}
            amount={order.due}
            currency={order.currency}
            reference={`Order #${order.orderNumber}`}
            title={online ? "Other ways to pay" : undefined}
            lead={
                ways
                    ? online
                        ? `${order.businessName} also takes ${due} by ${ways}.`
                        : `Pay ${due} by ${ways}.`
                    : null
            }
            className={className}
        />
    );
}

const STATUS: Record<PayOrder["status"], { label: string; cls: string }> = {
    DUE: { label: "To pay", cls: "bg-site-surface text-site-body" },
    PAID: { label: "Paid", cls: "bg-success text-success-foreground" },
    CLOSED: {
        label: "No longer payable",
        cls: "bg-site-surface text-site-muted",
    },
};

function StatusBadge({ status }: { status: PayOrder["status"] }) {
    const s = STATUS[status];
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                s.cls,
            )}
        >
            {s.label}
        </span>
    );
}
