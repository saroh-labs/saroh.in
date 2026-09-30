/**
 * How long Saroh waits on a payment provider before giving up (release
 * review). Node's `fetch` has no timeout of its own, so a provider that
 * accepts the connection and never answers would hold the pending sweep,
 * a hold's release or an autopay step for as long as the socket lives.
 * An aborted call rejects like a dropped connection, so each adapter's
 * existing network-error path (UNKNOWN, or a lookup's ERROR) handles it:
 * the money is not assumed either way, and the caller asks again later.
 */
export const PROVIDER_CALL_TIMEOUT_MS = 15_000;

/** A fresh signal for one provider call: aborts after {@link PROVIDER_CALL_TIMEOUT_MS}. */
export function providerCallSignal(): AbortSignal {
    return AbortSignal.timeout(PROVIDER_CALL_TIMEOUT_MS);
}
