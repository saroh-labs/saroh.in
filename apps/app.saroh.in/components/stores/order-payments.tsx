import { formatMoney } from "@/lib/format/money";
import { formatStatus } from "@/lib/format/status";
import { providerName } from "@/lib/payments/providers";
import type { OrderPaymentsSummary } from "@/lib/payments/service";

/**
 * Every attempt to take payment for an order, and every refund against it —
 * the provider's side of the story, under the order's own payment state.
 */
export function OrderPayments({
    summary,
    paymentStatus,
}: {
    summary: OrderPaymentsSummary | null;
    /** The order's own payment state — known even when the summary is not. */
    paymentStatus: string;
}) {
    const intents = summary?.intents ?? [];

    if (intents.length === 0) {
        return (
            <p className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                {paymentStatus === "PAID" || paymentStatus === "REFUNDED"
                    ? "Settled outside a card provider — in cash or by transfer — and recorded by hand."
                    : "No card payment has been tried. A payment taken in cash or by transfer is recorded from the order's menu."}
            </p>
        );
    }

    return (
        <ul className="flex flex-col gap-3">
            {intents.map((intent) => (
                <li key={intent.id} className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                        <span className="font-medium">
                            {providerName(intent.provider)}
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:text-muted-foreground">
                                {formatStatus(intent.status)}
                            </span>
                            <span className="font-display font-semibold tabular-nums">
                                {formatMoney(
                                    intent.amountCents,
                                    intent.currency,
                                )}
                            </span>
                        </span>
                    </div>
                    {intent.attempts.length > 0 ? (
                        <ul className="flex flex-col gap-1 text-[11.5px] text-muted-foreground">
                            {intent.attempts.map((a) => (
                                <li
                                    key={a.id}
                                    className="flex justify-between gap-2"
                                >
                                    <span>
                                        Attempt · {formatStatus(a.status)}
                                    </span>
                                    {a.providerRef ? (
                                        <span className="max-w-[55%] truncate font-mono">
                                            {a.providerRef}
                                        </span>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {intent.refunds.length > 0 ? (
                        <ul className="flex flex-col gap-1 text-[11.5px]">
                            {intent.refunds.map((r) => (
                                // `warning-subtle-foreground`, not `warning`:
                                // --warning is a FILL, and as text on the card
                                // it lands ~2.3:1.
                                <li
                                    key={r.id}
                                    className="flex justify-between gap-2 text-warning-subtle-foreground"
                                >
                                    <span>
                                        Refund · {formatStatus(r.status)}
                                    </span>
                                    <span className="tabular-nums">
                                        {formatMoney(r.amountCents, r.currency)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </li>
            ))}
        </ul>
    );
}
