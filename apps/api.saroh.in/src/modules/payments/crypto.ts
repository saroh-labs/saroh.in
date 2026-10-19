import type { EncryptedSecret, EncryptionKey } from "../../common/crypto";
import { decryptWithKey, encryptWithKey } from "../../common/crypto";
import { env } from "../../env";

/**
 * Merchant-credential encryption at rest (S5-002).
 *
 * Provider API secrets (Razorpay / Cashfree key secrets) are NEVER stored — or
 * logged — in plaintext. They are sealed by `common/crypto.ts` (AES-256-GCM)
 * under `PAYMENTS_ENC_KEY`, read at use time so dev/test can boot without
 * payments configured. Staff personal data has its own key
 * (`STAFF_PII_ENC_KEY`); this module only ever uses the payments one.
 */

export type { EncryptedSecret };

function paymentsKey(): EncryptionKey {
    return {
        name: "PAYMENTS_ENC_KEY",
        value: env.PAYMENTS_ENC_KEY,
        protects: "payment credentials",
    };
}

/** Seal a payment credential under `PAYMENTS_ENC_KEY`. */
export function encryptSecret(plaintext: string): EncryptedSecret {
    return encryptWithKey(plaintext, paymentsKey());
}

/** Open a payment credential sealed by {@link encryptSecret}. */
export function decryptSecret(sealed: EncryptedSecret): string {
    return decryptWithKey(sealed, paymentsKey());
}
