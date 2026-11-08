/**
 * A provider that refused a business's own keys (UX-012).
 *
 * Two moments read a provider's refusal:
 *
 *  - **On connect** an adapter checks the keys with one cheap
 *    authenticated read ({@link CredentialCheck}), so a typo is refused
 *    with a reason before anything is stored.
 *  - **On a live call** an adapter that gets a 401 or 403 throws
 *    {@link ProviderKeysRefusedError}; the caller marks the connection
 *    "needs attention" ({@link KEYS_REFUSED}) and tells the team once.
 *
 * Shared by payments and communications, so neither module imports the
 * other. Nothing here ever carries a credential: messages keep only the
 * HTTP status.
 */

/** What a provider said about a set of keys when asked on connect. */
export type CredentialCheck =
    /** It answered an authenticated read: the keys work. */
    | "ACCEPTED"
    /** It refused them (401/403): wrong, revoked or from another account. */
    | "REJECTED"
    /**
     * Stripe only: the key is real but can't read payments or refunds (a
     * restricted key without those permissions answers 403).
     */
    | "PERMISSION_MISSING"
    /** It didn't say (network, timeout, 429, 5xx or an answer we can't read). */
    | "UNSURE"
    /** Email only: the keys work, but the sending domain isn't verified. */
    | "DOMAIN_UNVERIFIED";

/** The provider refused the keys on a live call: nothing goes through. */
export const KEYS_REFUSED = "KEYS_REFUSED";
/**
 * Stripe only (KTD-14): the keys still take payments, but the restricted
 * key lacks a permission a payment uses on the side (Customers), so those
 * payments go through without it. Not a refusal: it blocks nothing and
 * tells no one "down"; the screen names the permission to add.
 */
export const PERMISSION_MISSING = "PERMISSION_MISSING";
export type AttentionReason = typeof KEYS_REFUSED | typeof PERMISSION_MISSING;

/**
 * What a provider row says to the screen about its health, beside its
 * status: null while it works, else why it needs attention and since when.
 */
export interface ProviderAttention {
    reason: AttentionReason;
    since: Date;
}

/** A row's attention columns, read as the screen's field. */
export function attentionOf(row: {
    attentionReason?: string | null;
    attentionAt?: Date | null;
}): ProviderAttention | null {
    const reason = row.attentionReason;
    if (
        (reason !== KEYS_REFUSED && reason !== PERMISSION_MISSING) ||
        !row.attentionAt
    ) {
        return null;
    }
    return { reason, since: row.attentionAt };
}

/** The columns a fresh connection (or re-entered keys) clears. */
export const NO_ATTENTION = { attentionReason: null, attentionAt: null };

/** 401 and 403: the provider refused the keys themselves. */
export function refusesKeys(status: number): boolean {
    return status === 401 || status === 403;
}

/**
 * A live provider call answered 401 or 403. Its message keeps only the
 * HTTP status, like every adapter error.
 */
export class ProviderKeysRefusedError extends Error {
    constructor(
        message: string,
        readonly httpStatus: number,
    ) {
        super(message);
        this.name = "ProviderKeysRefusedError";
    }
}

export function isKeysRefused(err: unknown): err is ProviderKeysRefusedError {
    return err instanceof ProviderKeysRefusedError;
}
