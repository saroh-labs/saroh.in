/**
 * What the API and the marketing site both say about a business's payment
 * webhook (DEC-063), in one place so the help pages can't drift from the
 * code (Resources plan U3, audit R4).
 *
 * Frontend-safe on purpose: no database, no env, no Node API. The API's
 * `webhooks.controller.ts` mounts {@link WEBHOOK_ROUTE}, its
 * `payments/webhook-setup.ts` builds the address from {@link webhookPath},
 * and `payments/webhook-secret.ts` lists {@link WEBHOOK_EVENTS}; the
 * marketing site's `content/integrations.test.ts` checks every integration
 * page against the same three.
 */

/** The payment providers a business connects its own account for. */
export const PAYMENT_WEBHOOK_PROVIDERS = ["RAZORPAY", "CASHFREE"] as const;
export type PaymentWebhookProvider = (typeof PAYMENT_WEBHOOK_PROVIDERS)[number];

/**
 * The public, unauthenticated route providers POST payment updates to,
 * without slashes, as Nest's `@Controller()` takes it. Trust comes from each
 * message's signature, never from the address.
 */
export const WEBHOOK_ROUTE = "public/webhooks";

/**
 * The path one business registers in its provider's dashboard:
 * `/public/webhooks/<provider>/<organizationId>`. The organization id in it
 * is not a secret.
 */
export function webhookPath(provider: string, organizationId: string): string {
    return `/${WEBHOOK_ROUTE}/${provider.toLowerCase()}/${encodeURIComponent(organizationId)}`;
}

/**
 * The webhook events to tick in the provider's dashboard: the ones the
 * API's `webhooks/providers/*.webhook.ts` act on. Autopay adds its own when
 * it is switched on for a business, and they are not listed here.
 */
export const WEBHOOK_EVENTS: Readonly<
    Record<PaymentWebhookProvider, readonly string[]>
> = {
    RAZORPAY: [
        "payment.captured",
        "payment.failed",
        "order.paid",
        "refund.processed",
        "refund.failed",
    ],
    CASHFREE: [
        "PAYMENT_SUCCESS_WEBHOOK",
        "PAYMENT_FAILED_WEBHOOK",
        "PAYMENT_USER_DROPPED_WEBHOOK",
        "REFUND_STATUS_WEBHOOK",
    ],
};
