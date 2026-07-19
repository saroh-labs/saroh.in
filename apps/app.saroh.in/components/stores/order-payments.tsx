import type { OrderPaymentsSummary } from "@/lib/payments/service";

import { RefundButton } from "./refund-button";

/**
 * Owner payments panel for the order detail view (S5-004). Renders the Order's
 * PaymentIntents with their provider, status, amount, attempts and any refunds,
 * plus a Refund control when there is a captured (SUCCEEDED) payment to refund.
 * Data comes from the authed org-scoped payments endpoint; a null summary (no
 * active org / not reachable) renders a quiet empty state.
 */

function money(amountCents: number, currency: string): string {
    return `${currency} ${(amountCents / 100).toFixed(2)}`;
}

function StatusPill({ status }: { status: string }) {
    return (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {status}
        </span>
    );
}

export function OrderPayments({
    orderId,
    summary,
}: {
    orderId: string;
    summary: OrderPaymentsSummary | null;
}) {
    const intents = summary?.intents ?? [];
    const refundable =
        summary?.paymentStatus === "PAID" &&
        intents.some((i) => i.status === "SUCCEEDED");

    return (
        <div className="rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
                <h3 className="text-sm font-medium">Payments</h3>
                {refundable ? <RefundButton orderId={orderId} /> : null}
            </div>

            {intents.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                    No payment attempts recorded for this order yet.
                </p>
            ) : (
                <ul className="divide-y">
                    {intents.map((intent) => (
                        <li key={intent.id} className="space-y-2 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                <span className="font-medium">
                                    {intent.provider}
                                </span>
                                <span className="flex items-center gap-2">
                                    <StatusPill status={intent.status} />
                                    <span className="tabular-nums">
                                        {money(
                                            intent.amountCents,
                                            intent.currency,
                                        )}
                                    </span>
                                </span>
                            </div>

                            {intent.attempts.length > 0 ? (
                                <ul className="space-y-1 text-xs text-muted-foreground">
                                    {intent.attempts.map((a) => (
                                        <li
                                            key={a.id}
                                            className="flex justify-between gap-2"
                                        >
                                            <span>Attempt · {a.status}</span>
                                            {a.providerRef ? (
                                                <span className="max-w-[55%] truncate tabular-nums">
                                                    {a.providerRef}
                                                </span>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}

                            {intent.refunds.length > 0 ? (
                                <ul className="space-y-1 text-xs">
                                    {intent.refunds.map((r) => (
                                        <li
                                            key={r.id}
                                            className="flex justify-between gap-2 text-amber-700 dark:text-amber-400"
                                        >
                                            <span>Refund · {r.status}</span>
                                            <span className="tabular-nums">
                                                {money(
                                                    r.amountCents,
                                                    r.currency,
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
