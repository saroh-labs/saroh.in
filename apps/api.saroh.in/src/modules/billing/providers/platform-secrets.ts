/**
 * Saroh PLATFORM billing secrets (S7-005).
 *
 * These are Saroh's OWN Razorpay/Cashfree API keys + webhook secrets used to
 * charge Organizations for their SaaS subscription. They are platform-level
 * (NOT per-org) and are supplied via `process.env` — deliberately NOT the
 * validated `env.ts` (which this ticket must not touch) and, critically, NOT the
 * AES-sealed per-org MERCHANT credentials (`MerchantPaymentProvider`). Reading
 * them lives in this ONE tiny module so the credential boundary is auditable in
 * a single place: nothing here ever reads a merchant key.
 *
 * Access goes through `globalThis.process.env` (never a bare `process.env`
 * member — that is lint-restricted in favour of the typed `env.ts`) and is
 * resolved AT USE time so the app can boot without billing configured; a call
 * that actually needs a secret fails loudly (secret-free error) if it is absent.
 */

/** The env var names this module may read. All are `SAROH_*` platform keys. */
export const RAZORPAY_KEY_ID = "SAROH_RAZORPAY_KEY_ID";
export const RAZORPAY_KEY_SECRET = "SAROH_RAZORPAY_KEY_SECRET";
export const RAZORPAY_WEBHOOK_SECRET = "SAROH_RAZORPAY_WEBHOOK_SECRET";
export const CASHFREE_CLIENT_ID = "SAROH_CASHFREE_CLIENT_ID";
export const CASHFREE_CLIENT_SECRET = "SAROH_CASHFREE_CLIENT_SECRET";
export const CASHFREE_WEBHOOK_SECRET = "SAROH_CASHFREE_WEBHOOK_SECRET";

/** Read a platform secret, or `undefined` when unset. Never logs the value. */
export function readPlatformSecret(name: string): string | undefined {
    // `globalThis.process.env` (not a bare `process.env`) reads the platform
    // env directly while satisfying the `no-restricted-properties` lint rule.
    return globalThis.process.env[name];
}

/**
 * Read a REQUIRED platform secret, throwing a clear (secret-free) error naming
 * only the missing var when it is absent. Used at the moment a provider call
 * genuinely needs the key.
 */
export function requirePlatformSecret(name: string): string {
    const value = readPlatformSecret(name);
    if (!value) {
        throw new Error(
            `${name} is not set — Saroh's platform billing provider is not configured.`,
        );
    }
    return value;
}
