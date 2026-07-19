"use client";

import { useCallback, useEffect, useState } from "react";

import type {
    CheckoutIntent,
    CheckoutReceipt,
    ReceiptPaymentStatus,
} from "@/lib/checkout";
import { createPaymentIntent, fetchReceipt } from "@/lib/checkout";
import { cn } from "@/lib/utils";

import { ctaClasses } from "./sections/cta";

/**
 * `Checkout` (S5-004) — the PUBLIC buyer checkout + receipt view behind
 * `/checkout/:orderId`. It:
 *
 *  1. Loads the buyer-safe receipt (`GET /public/orders/:id/receipt`) and shows
 *     the order summary + a prominent PAID/UNPAID/FAILED/REFUNDED badge.
 *  2. On "Pay", POSTs to create a payment intent — NO amount is ever sent; the
 *     API fixes the charge from the Order. The returned non-secret handoff
 *     (`publicKey`, `clientParams`) is rendered inside a clear "provider widget
 *     mounts here" boundary. The real Razorpay/Cashfree widget needs the
 *     provider JS SDK + live keys, which aren't wired here, so we do NOT fake a
 *     success — the buyer's true state only ever comes from the reconciled
 *     receipt.
 *  3. "Refresh status" re-reads the receipt so the buyer sees PAID/REFUNDED once
 *     the webhook reconciler (S5-003) moves the order.
 *
 * A stable idempotency key per mount means a double-click can't create two
 * intents.
 */

const STATUS_STYLES: Record<ReceiptPaymentStatus, string> = {
    PAID: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    UNPAID: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
    FAILED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    REFUNDED:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

type LoadState =
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; receipt: CheckoutReceipt };

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between text-sm">
            <span className="text-stone-500 dark:text-stone-400">{label}</span>
            <span className="tabular-nums text-stone-900 dark:text-white">
                {value}
            </span>
        </div>
    );
}

function StatusBadge({ status }: { status: ReceiptPaymentStatus }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                STATUS_STYLES[status],
            )}
        >
            {status}
        </span>
    );
}

export default function Checkout({ orderId }: { orderId: string }) {
    const [state, setState] = useState<LoadState>({ kind: "loading" });
    const [paying, setPaying] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);
    const [intent, setIntent] = useState<CheckoutIntent | null>(null);

    // A stable idempotency key per mount so a double-click / retry can't create
    // two intents for this checkout attempt.
    const [idempotencyKey] = useState(() =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2),
    );

    // Pure fetch → next state. It does NOT setState itself, so the effect can
    // apply the result in an async `.then` (never a synchronous set in the
    // effect body). Mirrors the booking section's slot loader.
    const fetchState = useCallback(async (): Promise<LoadState> => {
        const res = await fetchReceipt(orderId);
        return res.ok
            ? { kind: "ready", receipt: res.data }
            : { kind: "error", message: res.error };
    }, [orderId]);

    useEffect(() => {
        let active = true;
        void fetchState().then((next) => {
            if (active) setState(next);
        });
        return () => {
            active = false;
        };
    }, [fetchState]);

    // Reload from an event handler (Refresh button) — the synchronous "loading"
    // set is fine here because it is not inside an effect.
    const reload = useCallback(() => {
        setState({ kind: "loading" });
        void fetchState().then(setState);
    }, [fetchState]);

    async function onPay() {
        setPaying(true);
        setPayError(null);
        const res = await createPaymentIntent(orderId, { idempotencyKey });
        setPaying(false);
        if (res.ok) {
            setIntent(res.data);
        } else {
            setPayError(res.error);
        }
    }

    if (state.kind === "loading") {
        return (
            <section className="mx-auto w-full max-w-xl px-5 py-16 sm:px-8">
                <p className="text-stone-500 dark:text-stone-400">
                    Loading your order…
                </p>
            </section>
        );
    }

    if (state.kind === "error") {
        return (
            <section className="mx-auto w-full max-w-xl px-5 py-16 sm:px-8">
                <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                >
                    {state.message}
                </div>
            </section>
        );
    }

    const { receipt } = state;
    const cur = receipt.currency;
    const settled =
        receipt.paymentStatus === "PAID" ||
        receipt.paymentStatus === "REFUNDED";

    return (
        <section className="mx-auto w-full max-w-xl px-5 py-16 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">
                        Order {receipt.orderNumber}
                    </h1>
                    <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                        Fulfilment: {receipt.fulfilmentStatus}
                    </p>
                </div>
                <StatusBadge status={receipt.paymentStatus} />
            </div>

            <div className="mt-8 rounded-xl border border-stone-200 p-5 dark:border-stone-700">
                <div className="space-y-2">
                    <SummaryRow
                        label="Subtotal"
                        value={`${cur} ${receipt.subtotal}`}
                    />
                    <SummaryRow label="Tax" value={`${cur} ${receipt.tax}`} />
                    <SummaryRow
                        label="Shipping"
                        value={`${cur} ${receipt.shipping}`}
                    />
                    <SummaryRow
                        label="Discount"
                        value={`− ${cur} ${receipt.discount}`}
                    />
                    <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-semibold text-stone-900 dark:border-stone-700 dark:text-white">
                        <span>Total</span>
                        <span className="tabular-nums">
                            {cur} {receipt.total}
                        </span>
                    </div>
                </div>
            </div>

            {settled ? (
                <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-5 text-center dark:border-stone-700 dark:bg-stone-900">
                    <p className="text-stone-900 dark:text-white">
                        {receipt.paymentStatus === "PAID"
                            ? "Payment received — thank you! A receipt has been recorded for this order."
                            : "This order has been refunded."}
                    </p>
                </div>
            ) : (
                <div className="mt-6 space-y-4">
                    {payError ? (
                        <p role="alert" className="text-sm text-red-600">
                            {payError}
                        </p>
                    ) : null}

                    {intent ? (
                        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5 dark:border-stone-600 dark:bg-stone-900">
                            <p className="text-sm font-medium text-stone-900 dark:text-white">
                                Provider payment widget mounts here
                            </p>
                            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                                The {intent.provider} checkout widget would open
                                with the handoff parameters below. It requires
                                the provider JS SDK and live keys, which aren’t
                                wired in this environment — so no payment is
                                simulated here.
                            </p>
                            <dl className="mt-4 space-y-1 text-xs text-stone-600 dark:text-stone-300">
                                <div className="flex justify-between gap-4">
                                    <dt>Amount</dt>
                                    <dd className="tabular-nums">
                                        {intent.currency}{" "}
                                        {(intent.amountCents / 100).toFixed(2)}
                                    </dd>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <dt>Provider order id</dt>
                                    <dd className="max-w-[60%] truncate">
                                        {intent.providerIntentId}
                                    </dd>
                                </div>
                                {intent.publicKey ? (
                                    <div className="flex justify-between gap-4">
                                        <dt>Public key</dt>
                                        <dd className="max-w-[60%] truncate">
                                            {intent.publicKey}
                                        </dd>
                                    </div>
                                ) : null}
                            </dl>
                            <pre className="mt-4 max-w-full overflow-x-auto rounded-lg bg-stone-900 p-3 text-[11px] leading-relaxed text-stone-100 dark:bg-black">
                                {JSON.stringify(intent.clientParams, null, 2)}
                            </pre>
                            <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
                                Once the buyer completes payment, the provider
                                webhook reconciles this order. Use “Refresh
                                status” to see it move to PAID.
                            </p>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={onPay}
                            disabled={paying}
                            className={cn(
                                ctaClasses("primary"),
                                "w-full disabled:cursor-not-allowed disabled:opacity-60",
                            )}
                        >
                            {paying
                                ? "Starting payment…"
                                : `Pay ${cur} ${receipt.total}`}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={reload}
                        className={cn(ctaClasses("secondary"), "w-full")}
                    >
                        Refresh status
                    </button>
                </div>
            )}
        </section>
    );
}
