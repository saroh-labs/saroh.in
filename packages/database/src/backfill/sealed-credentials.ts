/**
 * Open a merchant provider's sealed credentials, for the D22 backfill's
 * command line only (razorpay-public-keys.cli.ts). Not exported from the
 * package: the API opens credentials with its own `payments/crypto.ts`, and
 * this must stay byte-compatible with it — AES-256-GCM, a 12-byte iv, and
 * `PAYMENTS_ENC_KEY` as 64 hex characters or base64 of 32 bytes. The API's
 * integration suite runs the backfill with the API's own decrypt, and this
 * package's test seals a blob the API's way and opens it here.
 *
 * Nothing here logs the key, the plaintext or the key bytes; its errors
 * describe only the shape of what is wrong.
 */
import { createDecipheriv } from "node:crypto";

import type { OpenSealed, SealedCredentials } from "./razorpay-public-keys";

const KEY_BYTES = 32;

/** The 32-byte key from `PAYMENTS_ENC_KEY`'s value. Throws when unusable. */
export function paymentsKey(raw: string | undefined): Buffer {
    if (!raw) {
        throw new Error(
            "PAYMENTS_ENC_KEY is not set — it is needed to read the sealed key ids.",
        );
    }
    const key = /^[0-9a-fA-F]{64}$/.test(raw)
        ? Buffer.from(raw, "hex")
        : Buffer.from(raw, "base64");
    if (key.length !== KEY_BYTES) {
        throw new Error(
            `PAYMENTS_ENC_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}).`,
        );
    }
    return key;
}

/** An opener for blobs sealed under `key`. */
export function openerFor(key: Buffer): OpenSealed {
    return ({ ciphertext, iv, authTag }: SealedCredentials) => {
        const decipher = createDecipheriv(
            "aes-256-gcm",
            key,
            Buffer.from(iv, "base64"),
        );
        decipher.setAuthTag(Buffer.from(authTag, "base64"));
        return Buffer.concat([
            decipher.update(Buffer.from(ciphertext, "base64")),
            decipher.final(),
        ]).toString("utf8");
    };
}
