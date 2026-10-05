/**
 * A tiny in-process fixed-window rate limiter (S3-002).
 *
 * Keyed by an arbitrary string (the enquiry command uses `${formId}:${ipHash}`).
 * Each key gets `limit` allowed hits per `windowMs`; the window resets lazily on
 * the first hit after it expires.
 *
 * NOTE: this is PER-INSTANCE (per API process) and non-durable — it is a cheap
 * abuse speed-bump, not a global guarantee. Behind multiple API replicas a
 * determined client gets `limit` hits PER replica. A distributed limiter
 * (e.g. Redis token bucket / sliding window) is a deliberate later concern; the
 * in-process limiter keeps S3-002 self-contained with no new infra dependency.
 *
 * Bounded: every key is a stranger's (an address hash, an email), so the map
 * would otherwise grow for as long as the process runs. Expired windows are
 * swept at most once per window, and past {@link MAX_KEYS} live keys the
 * oldest are dropped first — which only ever forgives a hit, never refuses
 * one.
 */
export const MAX_KEYS = 10_000;

export class FixedWindowRateLimiter {
    private readonly windows = new Map<
        string,
        { count: number; resetAt: number }
    >();

    /**
     * @param limit    max hits allowed per window (default 5)
     * @param windowMs window length in ms (default 60_000 — one minute)
     */
    private nextSweep = 0;

    constructor(
        private readonly limit = 5,
        private readonly windowMs = 60_000,
        private readonly maxKeys = MAX_KEYS,
    ) {}

    /** How many keys are held: for tests. */
    get size(): number {
        return this.windows.size;
    }

    private sweep(now: number): void {
        if (now >= this.nextSweep) {
            this.nextSweep = now + this.windowMs;
            for (const [key, window] of this.windows) {
                if (now >= window.resetAt) this.windows.delete(key);
            }
        }
        // Still full: the oldest go first (a Map keeps insertion order).
        while (this.windows.size >= this.maxKeys) {
            const oldest = this.windows.keys().next().value;
            if (oldest === undefined) break;
            this.windows.delete(oldest);
        }
    }

    /**
     * Record a hit for `key`. Returns `true` if it is within the limit (allowed)
     * or `false` if the key has exhausted its window (caller should 429).
     */
    take(key: string, now: number = Date.now()): boolean {
        const window = this.windows.get(key);

        if (!window || now >= window.resetAt) {
            // Re-inserted, so a renewed key moves to the back of the order.
            this.windows.delete(key);
            this.sweep(now);
            this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
            return true;
        }

        if (window.count >= this.limit) {
            return false;
        }

        window.count += 1;
        return true;
    }
}
