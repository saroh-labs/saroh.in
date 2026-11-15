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
 * Each variable is a key ring (DEC-214): values are sealed and fingerprinted
 * with the newest key and carry its id, so a key can be replaced without
 * breaking what is stored (`docs/architecture/runbooks/KEY_ROTATION.md`).
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
 * The id of a value stored with no id: everything sealed or fingerprinted
 * before the ring, and a single-key setting. Values under it are stored
 * without a prefix, exactly as before, so a rollback can still open them.
 */
export const FIRST_KEY_ID = "v1";
const KEY_ID = /^[a-z0-9]{1,16}$/;
const STORED_ID = /^([a-z0-9]{1,16}):/;

interface RingKey {
    id: string;
    key: Buffer;
}

/**
 * Resolve + validate one 32-byte AES key. Accepts either 64 hex chars or
 * base64 that decodes to exactly 32 bytes. Throws a clear (secret-free) error
 * when the value is the wrong length.
 */
function parseKey(name: string, id: string | null, value: string): Buffer {
    const key = /^[0-9a-fA-F]{64}$/.test(value)
        ? Buffer.from(value, "hex")
        : Buffer.from(value, "base64");

    if (key.length !== KEY_BYTES) {
        const which = id === null ? name : `${name} key "${id}"`;
        throw new Error(
            `${which} must decode to ${KEY_BYTES} bytes (got ${key.length}); provide 64 hex chars or a base64-encoded 32-byte key.`,
        );
    }
    return key;
}

/**
 * The key ring a variable holds, newest first: one key (id `v1`), or
 * `v2:<key>,v1:<key>`. Base64 and hex never contain `:`, so one key reads as
 * before. A managed key service fits later as another entry (`v3:kms:...`);
 * stored values only ever carry the id. Every message starts with the
 * variable's name (callers turn that into a 503) and never quotes a key.
 */
function loadRing({ name, value, protects }: EncryptionKey): RingKey[] {
    if (!value) {
        throw new Error(
            `${name} is not set — a 32-byte key (64 hex chars or base64) is required to encrypt or decrypt ${protects}.`,
        );
    }
    if (!value.includes(":")) {
        return [{ id: FIRST_KEY_ID, key: parseKey(name, null, value) }];
    }
    const ring: RingKey[] = [];
    value.split(",").forEach((entry, at) => {
        const cut = entry.indexOf(":");
        const id = entry.slice(0, Math.max(cut, 0)).trim();
        if (!KEY_ID.test(id)) {
            throw new Error(
                `${name} entry ${at + 1} needs an id of 1-16 lowercase letters or digits, then ":" and the key, e.g. v2:<key>,v1:<key>.`,
            );
        }
        if (ring.some((k) => k.id === id)) {
            throw new Error(`${name} has key "${id}" twice.`);
        }
        ring.push({ id, key: parseKey(name, id, entry.slice(cut + 1).trim()) });
    });
    return ring;
}

/** The id and body of a stored ciphertext or fingerprint; no prefix is `v1`. */
function splitStored(stored: string): { id: string; body: string } {
    const m = STORED_ID.exec(stored);
    return m?.[1]
        ? { id: m[1], body: stored.slice(m[0].length) }
        : { id: FIRST_KEY_ID, body: stored };
}

const tagged = (id: string, body: string) =>
    id === FIRST_KEY_ID ? body : `${id}:${body}`;

/** The id of the key a stored ciphertext or fingerprint was made with. */
export const storedKeyId = (stored: string): string => splitStored(stored).id;

/** The id new values are sealed and fingerprinted with. */
export const newestKeyId = (keySource: EncryptionKey): string =>
    loadRing(keySource)[0].id;

function keyFor(ring: RingKey[], id: string, name: string): Buffer {
    const found = ring.find((k) => k.id === id)?.key;
    if (!found) {
        throw new Error(
            `${name} has no key "${id}", which a stored value was sealed with. Put it back on the ring, or re-seal before removing it.`,
        );
    }
    return found;
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
    const { id, key } = loadRing(keySource)[0];
    const iv = randomBytes(IV_BYTES);

    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
        ciphertext: tagged(id, ciphertext.toString("base64")),
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
    const { id, body } = splitStored(ciphertext);
    const key = keyFor(loadRing(keySource), id, keySource.name);

    const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(authTag, "base64"));

    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(body, "base64")),
        decipher.final(), // throws on auth-tag mismatch (tampering)
    ]);
    return plaintext.toString("utf8");
}

const hmac = (key: Buffer, value: string, label: string) =>
    createHmac("sha256", key).update(`${label}\u0000${value}`).digest("hex");

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
    const { id, key } = loadRing(keySource)[0];
    return tagged(id, hmac(key, value, label));
}

/**
 * The digest of `value` under every key on the ring, newest first: a lookup
 * matches a fingerprint whichever key made it (`where: { in: ... }`).
 */
export function keyedDigests(
    value: string,
    label: string,
    keySource: EncryptionKey,
): string[] {
    return loadRing(keySource).map(({ id, key }) =>
        tagged(id, hmac(key, value, label)),
    );
}

/**
 * `sealed` moved onto the ring's newest key, or null when it is already
 * there (so a re-seal run is idempotent).
 */
export function resealWithKey(
    sealed: EncryptedSecret,
    keySource: EncryptionKey,
): EncryptedSecret | null {
    if (storedKeyId(sealed.ciphertext) === newestKeyId(keySource)) return null;
    return encryptWithKey(decryptWithKey(sealed, keySource), keySource);
}
