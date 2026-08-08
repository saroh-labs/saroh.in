/**
 * A tiny in-process fixed-window rate limiter (S4-002).
 *
 * Keyed by an arbitrary string (the public booking command uses
 * `${serviceId}:${ipHash}`). Each key gets `limit` allowed hits per `windowMs`;
 * the window resets lazily on the first hit after it expires.
 *
 * NOTE: this is PER-INSTANCE (per API process) and non-durable — it is a cheap
 * abuse speed-bump, not a global guarantee. Behind multiple API replicas a
 * determined client gets `limit` hits PER replica. A distributed limiter
 * (e.g. Redis token bucket / sliding window) is a deliberate later concern; the
 * in-process limiter keeps the public booking endpoint self-contained with no
 * new infra dependency. Mirrors the enquiry command's limiter (S3-002).
 */
export class FixedWindowRateLimiter {
    private readonly windows = new Map<
        string,
        { count: number; resetAt: number }
    >();

    /**
     * @param limit    max hits allowed per window (default 5)
     * @param windowMs window length in ms (default 60_000 — one minute)
     */
    constructor(
        private readonly limit = 5,
        private readonly windowMs = 60_000,
    ) {}

    /**
     * Record a hit for `key`. Returns `true` if it is within the limit (allowed)
     * or `false` if the key has exhausted its window (caller should 429).
     */
    take(key: string, now: number = Date.now()): boolean {
        const window = this.windows.get(key);

        if (!window || now >= window.resetAt) {
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
