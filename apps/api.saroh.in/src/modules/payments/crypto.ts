import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "../../env";

/**
 * Merchant-credential encryption at rest (S5-002).
 *
 * Provider API secrets (Razorpay / Cashfree key secrets) are NEVER stored — or
 * logged — in plaintext. They are sealed with AES-256-GCM (authenticated
 * encryption: any tampering with the ciphertext, iv, or auth tag makes
 * decryption throw) using a 32-byte key supplied via the `PAYMENTS_ENC_KEY`
 * env var. The key is resolved and validated AT USE time (not at import), so
 * dev/test can boot without payments configured; a call that actually needs to
 * en/decrypt fails loudly if the key is absent or malformed.
 *
 * SECURITY: nothing in this module ever logs the plaintext, the key, or the
 * derived key bytes. Errors describe only the *shape* problem (missing/length),
 * never any secret material.
 */

const ALGORITHM = "aes-256-gcm";
/** GCM's standard 96-bit nonce. A fresh random iv is used for every seal. */
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** A sealed secret. All three parts are base64 and all are required to open it. */
export interface EncryptedSecret {
    ciphertext: string;
    iv: string;
    authTag: string;
}

/**
 * Resolve + validate the 32-byte AES key from `PAYMENTS_ENC_KEY`. Accepts
 * either 64 hex chars or base64 that decodes to exactly 32 bytes. Throws a
 * clear (secret-free) error when the var is missing or the wrong length. Called
 * on every en/decrypt so the failure surfaces exactly where a secret would have
 * been handled.
 */
function loadKey(): Buffer {
    const raw = env.PAYMENTS_ENC_KEY;
    if (!raw) {
        throw new Error(
            "PAYMENTS_ENC_KEY is not set — a 32-byte key (64 hex chars or base64) is required to encrypt or decrypt payment credentials.",
        );
    }

    const key = /^[0-9a-fA-F]{64}$/.test(raw)
        ? Buffer.from(raw, "hex")
        : Buffer.from(raw, "base64");

    if (key.length !== KEY_BYTES) {
        throw new Error(
            `PAYMENTS_ENC_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}); provide 64 hex chars or a base64-encoded 32-byte key.`,
        );
    }
    return key;
}

/**
 * Seal `plaintext` with AES-256-GCM under a fresh random iv. Returns the
 * base64 ciphertext, iv, and auth tag — the tag binds the ciphertext so a
 * later {@link decryptSecret} throws if any part was altered.
 */
export function encryptSecret(plaintext: string): EncryptedSecret {
    const key = loadKey();
    const iv = randomBytes(IV_BYTES);

    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64"),
    };
}

/**
 * Open a secret sealed by {@link encryptSecret}. The GCM auth tag is verified
 * during `final()`, so a tampered ciphertext / iv / auth tag throws instead of
 * returning corrupt plaintext. Never logs the recovered plaintext.
 */
export function decryptSecret({
    ciphertext,
    iv,
    authTag,
}: EncryptedSecret): string {
    const key = loadKey();

    const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(authTag, "base64"));

    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64")),
        decipher.final(), // throws on auth-tag mismatch (tampering)
    ]);
    return plaintext.toString("utf8");
}
