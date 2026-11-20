/**
 * The in-process fixed-window rate limiter (S3-002, S4-002), one class for
 * every module (`enquiry/rate-limiter.ts` and `bookings/rate-limiter.ts`
 * re-export it).
 *
 * Keyed by an arbitrary string. Each key gets `limit` allowed hits per
 * `windowMs`; the window resets lazily on the first hit after it expires.
 *
 * PER PROCESS and non-durable: a restart empties it and each replica keeps
 * its own. A limit that guards money, a send or outbound work uses
 * {@link SharedRateLimiter} (`shared-window.ts`), which keeps the same
 * windows in Redis.
 *
 * A live window is never dropped to make room (03-M7): the old 10,000-key
 * ceiling let anyone who sent that many distinct keys wipe every other
 * caller's window. Memory is bounded by how many distinct keys arrive in
 * one window instead; expired windows are swept at most once a window, so
 * a full map costs one scan per window, not one per call.
 */
export class FixedWindowRateLimiter {
    private readonly windows = new Map<
        string,
        { count: number; resetAt: number }
    >();

    private nextSweep = 0;

    /**
     * @param limit    max hits allowed per window (default 5)
     * @param windowMs window length in ms (default 60_000 — one minute)
     */
    constructor(
        private readonly limit = 5,
        private readonly windowMs = 60_000,
    ) {}

    /** How many keys are held: for tests. */
    get size(): number {
        return this.windows.size;
    }

    /**
     * Record a hit for `key`. Returns `true` if it is within the limit (allowed)
     * or `false` if the key has exhausted its window (caller should 429).
     */
    take(key: string, now: number = Date.now()): boolean {
        this.sweep(now);
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

    /** Whether `key` has used its window up, without taking a hit. */
    blocked(key: string, now: number = Date.now()): boolean {
        const window = this.windows.get(key);
        return !!window && now < window.resetAt && window.count >= this.limit;
    }

    /**
     * Seconds until `key`'s window resets, for a 429 that says when to try
     * again (site sign-in codes, A2). At least 1; 1 for an unknown key.
     */
    retryAfterSeconds(key: string, now: number = Date.now()): number {
        const window = this.windows.get(key);
        if (!window) return 1;
        return Math.max(1, Math.ceil((window.resetAt - now) / 1000));
    }

    private sweep(now: number): void {
        if (now < this.nextSweep) return;
        this.nextSweep = now + this.windowMs;
        for (const [key, window] of this.windows) {
            if (now >= window.resetAt) this.windows.delete(key);
        }
    }
}
