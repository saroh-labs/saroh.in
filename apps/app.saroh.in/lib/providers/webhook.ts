import { providerName } from "@/lib/payments/providers";

import type { PaymentProviderName, PaymentWebhookSetup } from "./service";

/**
 * A payment provider's webhook, as setup and the providers list say it
 * (DEC-063). Every payment is confirmed by the provider's webhook, so a
 * connection is only finished once the provider knows where to send
 * payment updates and — for Razorpay — both sides hold the same signing
 * secret. The address, the events and whether a secret is asked for come
 * from the API (`GET …/payment-providers/webhooks`); only the words and
 * where to click in each provider's dashboard live here.
 */

/** Where the webhook is added in the provider's own dashboard. */
export const WEBHOOK_PLACE: Record<PaymentProviderName, string> = {
    RAZORPAY: "Accounts & Settings › Webhooks › Add New Webhook",
    CASHFREE: "Developers › Webhooks › Add Webhook Endpoint",
};

/** The webhook setup for one provider, or `null` when it wasn't read. */
export function webhookFor(
    webhooks: readonly PaymentWebhookSetup[] | null | undefined,
    provider: PaymentProviderName,
): PaymentWebhookSetup | null {
    return webhooks?.find((w) => w.provider === provider) ?? null;
}

/** A Razorpay key id in test mode: its webhook lives in the test dashboard. */
export function isTestKey(keyId: string): boolean {
    return keyId.trim().startsWith("rzp_test_");
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "2 min ago", "3 h ago", "yesterday", "5 days ago". */
export function sinceWords(at: Date, now: Date): string {
    const gap = Math.max(0, now.getTime() - at.getTime());
    if (gap < MINUTE) return "just now";
    if (gap < HOUR) return `${Math.floor(gap / MINUTE)} min ago`;
    if (gap < DAY) return `${Math.floor(gap / HOUR)} h ago`;
    const days = Math.floor(gap / DAY);
    return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * The providers row's line about the webhook: when a payment update last
 * arrived — only deliveries whose signature checked out are kept, so one
 * proves the webhook works — or that none has yet. `null` when the setup
 * wasn't read: nothing is claimed either way.
 */
export function lastUpdateLine(
    setup: PaymentWebhookSetup | null,
    now: Date,
): string | null {
    if (!setup) return null;
    const name = providerName(setup.provider);
    if (!setup.lastReceivedAt) {
        return `No payment updates received yet — check the webhook in ${name}.`;
    }
    const at = new Date(setup.lastReceivedAt);
    if (Number.isNaN(at.getTime())) return null;
    return `Last payment update from ${name}: ${sinceWords(at, now)}.`;
}

/**
 * A strong webhook signing secret, made in the browser: 24 random bytes as
 * 48 hex characters. The merchant pastes the same one into the provider's
 * dashboard; it leaves the browser only in the connect call, sealed there.
 */
export function generateWebhookSecret(
    random: (bytes: Uint8Array) => Uint8Array = (b) =>
        globalThis.crypto.getRandomValues(b),
): string {
    const bytes = random(new Uint8Array(24));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
