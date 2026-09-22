import type { CheckoutIntent } from "@/lib/checkout-shape";

/**
 * Where the provider's hosted payment opens, given the non-secret handoff the
 * API returned for an intent (`publicKey`, `clientParams`). Shared by order
 * checkout and the invoice pay page, so both hand over the same way.
 *
 * The real Razorpay/Cashfree widget needs the provider JS SDK and live keys,
 * which are not wired yet, so no success is faked: the page's true state only
 * ever comes from the webhook, which the page re-reads.
 */
export function ProviderHandoff({
    intent,
    after,
}: {
    intent: CheckoutIntent;
    /** What moves once the buyer has paid, for the closing line. */
    after: string;
}) {
    return (
        <div className="rounded-xl border border-dashed border-site-border bg-site-surface p-5">
            <p className="text-sm font-medium text-site-fg">
                Provider payment widget mounts here
            </p>
            <p className="mt-1 text-xs text-site-muted">
                The {intent.provider} checkout widget would open with the
                handoff parameters below. It requires the provider JS SDK and
                live keys, which aren’t wired in this environment — so no
                payment is simulated here.
            </p>
            <dl className="mt-4 space-y-1 text-xs text-site-body">
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
            <pre className="mt-4 max-w-full overflow-x-auto rounded-lg bg-site-accent p-3 text-[11px] leading-relaxed text-site-fg">
                {JSON.stringify(intent.clientParams, null, 2)}
            </pre>
            <p className="mt-3 text-xs text-site-muted">{after}</p>
        </div>
    );
}
