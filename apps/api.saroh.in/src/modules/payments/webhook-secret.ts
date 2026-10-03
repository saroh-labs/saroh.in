import type { SupportedProvider } from "./providers/provider.port";

/**
 * How a business's payment provider tells Saroh a payment went through
 * (DEC-063).
 *
 * Every payment is confirmed by the provider's webhook: it POSTs to
 * `/public/webhooks/<provider>/<organizationId>`, signed, and Saroh checks
 * the signature before believing it (`webhooks.service.ts`). What it is
 * signed with differs:
 *
 * - **Razorpay** signs with a webhook secret the merchant chooses when
 *   adding the webhook in Razorpay's dashboard — separate from the API key
 *   secret. Without it every webhook is refused, and a customer who paid
 *   stays "Awaiting payment". So a Razorpay connection requires it.
 * - **Cashfree** signs with the app's client secret — the key secret the
 *   merchant already enters — so there is nothing more to ask for. A
 *   Cashfree connection that saved a webhook secret anyway keeps using it.
 */

/** Whether the provider signs its webhooks with a secret of its own. */
export function needsWebhookSecret(provider: string): boolean {
    return provider.toUpperCase() === "RAZORPAY";
}

/** What a connect without the secret is refused with (400). */
export const WEBHOOK_SECRET_REQUIRED =
    "Add the webhook signing secret from Razorpay › Webhooks, so Saroh can confirm payments.";

/**
 * The webhook events to tick in the provider's dashboard: the ones
 * `webhooks/providers/*.webhook.ts` act on. Autopay adds its own when it is
 * switched on (`supportsMandates` is still false).
 */
export const WEBHOOK_EVENTS: Record<SupportedProvider, readonly string[]> = {
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

/** The sealed blob, as far as webhooks care. */
export interface SealedCredentials {
    keySecret?: string;
    webhookSecret?: string;
}

/**
 * The secret a provider's webhooks are signed with, from the opened blob:
 * the webhook secret, or for Cashfree the key secret when none was saved.
 * `null` when there is none — the verifier then refuses every delivery.
 */
export function webhookSecretFrom(
    provider: string,
    creds: SealedCredentials,
): string | null {
    const own = creds.webhookSecret?.trim();
    if (own) return own;
    if (needsWebhookSecret(provider)) return null;
    // An empty key secret is none.
    const key = creds.keySecret?.trim();
    if (!key) return null;
    return key;
}
