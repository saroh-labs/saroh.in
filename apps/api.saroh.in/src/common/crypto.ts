import {
    createCipheriv,
    createDecipheriv,
    createHmac,
    randomBytes,
} from "node:crypto";

/**
 * Encryption at rest for values Saroh must keep but never show whole:
 * merchants' provider credentials (S5-002, `PAYMENTS_ENC_KEY`) and a staff
 * member's tax id (DEC-169, `STAFF_PII_ENC_KEY`). Each kind of value has its
 * own key, so a leak of one key opens only its own kind.
 *
 * Values are sealed with AES-256-GCM (authenticated encryption: any tampering
 * with the ciphertext, iv, or auth tag makes decryption throw) under a 32-byte
 * key the caller passes in. The key is validated AT USE time (not at import),
 * so dev/test can boot without it; a call that actually needs to en/decrypt
 * fails loudly if the key is absent or malformed.
 *
 * SECURITY: nothing in this module ever logs the plaintext, the key, or the
 * derived key bytes. Errors describe only the *shape* problem (missing/length)
 * and name the variable, never any secret material.
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
 * The key to seal or open with: the environment variable's name (for the
 * error message only), its raw value as read from the env, and what it
 * protects, in words.
 */
export interface EncryptionKey {
    name: string;
    value: string | undefined;
    protects: string;
}

/**
 * Resolve + validate the 32-byte AES key. Accepts either 64 hex chars or
 * base64 that decodes to exactly 32 bytes. Throws a clear (secret-free) error
 * when the value is missing or the wrong length.
 */
function loadKey({ name, value, protects }: EncryptionKey): Buffer {
    if (!value) {
        throw new Error(
            `${name} is not set — a 32-byte key (64 hex chars or base64) is required to encrypt or decrypt ${protects}.`,
        );
    }

    const key = /^[0-9a-fA-F]{64}$/.test(value)
        ? Buffer.from(value, "hex")
        : Buffer.from(value, "base64");

    if (key.length !== KEY_BYTES) {
        throw new Error(
            `${name} must decode to ${KEY_BYTES} bytes (got ${key.length}); provide 64 hex chars or a base64-encoded 32-byte key.`,
        );
    }
    return key;
}

/**
 * Seal `plaintext` with AES-256-GCM under a fresh random iv. Returns the
 * base64 ciphertext, iv, and auth tag — the tag binds the ciphertext so a
 * later {@link decryptWithKey} throws if any part was altered.
 */
export function encryptWithKey(
    plaintext: string,
    keySource: EncryptionKey,
): EncryptedSecret {
    const key = loadKey(keySource);
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
 * Open a secret sealed by {@link encryptWithKey} under the same key. The GCM
 * auth tag is verified during `final()`, so a tampered ciphertext / iv / auth
 * tag throws instead of returning corrupt plaintext. Never logs the
 * recovered plaintext.
 */
export function decryptWithKey(
    { ciphertext, iv, authTag }: EncryptedSecret,
    keySource: EncryptionKey,
): string {
    const key = loadKey(keySource);

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

/**
 * A keyed, one-way digest of `value` (HMAC-SHA256 under the same key, with a
 * label so it never equals a digest made for another use). For comparing a
 * sealed value without storing anything a short value could be guessed back
 * from: a plain hash of a 10-character tax id is brute-forced offline, this
 * is not without the key.
 */
export function keyedDigest(
    value: string,
    label: string,
    keySource: EncryptionKey,
): string {
    return createHmac("sha256", loadKey(keySource))
        .update(`${label}\u0000${value}`)
        .digest("hex");
}
