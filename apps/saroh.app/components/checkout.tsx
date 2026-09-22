"use client";

import { useCallback, useEffect, useState } from "react";

import { ProviderHandoff } from "@/components/provider-handoff";
import type {
    CheckoutIntent,
    CheckoutReceipt,
    CheckoutStorefront,
    ReceiptPaymentStatus,
} from "@/lib/checkout";
import { createPaymentIntent, fetchReceipt } from "@/lib/checkout";
import { cn } from "@saroh/ui/lib/utils";

import { ctaClasses, destructiveAlertClasses } from "@saroh/site-blocks";

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

/**
 * Payment state is Saroh's chrome, not the merchant's design, so it speaks in
 * Saroh's status tokens — but as OPAQUE FILLS with their own foreground, not as
 * the pale tints app.saroh.in uses for the same job. Two reasons, both about
 * standing on a ground we do not own:
 *
 *  - The workspace can afford a tint because it knows its own page colour. Here
 *    the page is `--site-*`, which is already black under a dark OS and becomes
 *    merchant data as soon as publications carry brand fields. A fill measured
 *    against itself is the only ratio that survives that.
 *  - `--brand-subtle` would have matched the workspace's "money received" recipe
 *    exactly, but brand tokens are Saroh's identity and this subtree is someone
 *    else's website. `--success` says the same thing in a hue that means a
 *    STATE rather than a company.
 *
 * UNPAID stays in the merchant's own neutrals: it is the absence of a state, and
 * the resting case should look like the site it sits in.
 */
const STATUS_STYLES: Record<ReceiptPaymentStatus, string> = {
    PAID: "bg-success text-success-foreground",
    UNPAID: "bg-site-surface text-site-body",
    FAILED: "bg-destructive text-destructive-foreground",
    REFUNDED: "bg-warning text-warning-foreground",
};

type LoadState =
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; receipt: CheckoutReceipt };

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between text-sm">
            <span className="text-site-muted">{label}</span>
            <span className="tabular-nums text-site-fg">{value}</span>
        </div>
    );
}

const DAY_LABEL: Record<string, string> = {
    MON: "Mon",
    TUE: "Tue",
    WED: "Wed",
    THU: "Thu",
    FRI: "Fri",
    SAT: "Sat",
    SUN: "Sun",
};

/** Where the order was placed, as the shop describes itself. */
function StorefrontCard({ storefront }: { storefront: CheckoutStorefront }) {
    return (
        <div className="mt-6 text-sm text-site-body">
            <p className="font-medium text-site-fg">{storefront.name}</p>
            {storefront.address ? (
                <p className="mt-1 whitespace-pre-line text-site-muted">
                    {storefront.address}
                </p>
            ) : null}
            {storefront.openingHours ? (
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs text-site-muted">
                    {storefront.openingHours.map((d) => (
                        <div key={d.day} className="contents">
                            <dt>{DAY_LABEL[d.day] ?? d.day}</dt>
                            <dd className="tabular-nums">
                                {d.closed ? "Closed" : `${d.open}–${d.close}`}
                            </dd>
                        </div>
                    ))}
                </dl>
            ) : null}
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
                <p className="text-site-muted">Loading your order…</p>
            </section>
        );
    }

    if (state.kind === "error") {
        return (
            <section className="mx-auto w-full max-w-xl px-5 py-16 sm:px-8">
                <div
                    role="alert"
                    className={cn(
                        destructiveAlertClasses,
                        "rounded-xl p-6 text-center",
                    )}
                >
                    {state.message}
                </div>
            </section>
        );
    }

    const { receipt } = state;
    const cur = receipt.currency;
    const storefront = receipt.storefront;
    // Paused: the API refuses the payment anyway; the page says so first
    // rather than offering a button that can only fail.
    const paused = storefront?.acceptingPayments === false;
    const settled =
        receipt.paymentStatus === "PAID" ||
        receipt.paymentStatus === "REFUNDED";

    return (
        <section className="mx-auto w-full max-w-xl px-5 py-16 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-site-fg">
                        Order {receipt.orderNumber}
                    </h1>
                    <p className="mt-1 text-sm text-site-muted">
                        Fulfilment: {receipt.fulfilmentStatus}
                    </p>
                </div>
                <StatusBadge status={receipt.paymentStatus} />
            </div>

            {storefront ? <StorefrontCard storefront={storefront} /> : null}

            <div className="mt-8 rounded-xl border border-site-border p-5">
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
                    <div className="flex justify-between border-t border-site-border pt-2 text-base font-semibold text-site-fg">
                        <span>Total</span>
                        <span className="tabular-nums">
                            {cur} {receipt.total}
                        </span>
                    </div>
                </div>
            </div>

            {!settled && paused ? (
                <div className="mt-6 rounded-xl border border-site-border bg-site-surface p-5 text-center">
                    <p className="text-site-fg">
                        {storefront.name} is not taking payments right now. Your
                        order is kept — please try again later.
                    </p>
                </div>
            ) : settled ? (
                <div className="mt-6 rounded-xl border border-site-border bg-site-surface p-5 text-center">
                    <p className="text-site-fg">
                        {receipt.paymentStatus === "PAID"
                            ? "Payment received — thank you! A receipt has been recorded for this order."
                            : "This order has been refunded."}
                    </p>
                </div>
            ) : (
                <div className="mt-6 space-y-4">
                    {payError ? (
                        <p role="alert" className={destructiveAlertClasses}>
                            {payError}
                        </p>
                    ) : null}

                    {intent ? (
                        <ProviderHandoff
                            intent={intent}
                            after="Once the buyer completes payment, the provider webhook reconciles this order. Use “Refresh status” to see it move to PAID."
                        />
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
