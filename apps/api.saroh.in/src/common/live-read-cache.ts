/**
 * A short in-process cache for the public live reads a merchant's page polls
 * (review #4, #21): On today, the Timetable and the shop's "N left".
 *
 * Every visitor of a site asks the same question, and the answer is the
 * same for all of them (nothing personal is in it: display names, starts,
 * places and counts). So one answer is worked out per key and kept for
 * `ttlMs`, and while it is being worked out every other caller waits for
 * that one (single-flight) instead of starting its own.
 *
 * What a visitor sees: an answer at most `ttlMs` old. A time booked in that
 * window may still show as free until the next read, and booking it is
 * refused honestly by the booking itself, which never reads this cache.
 *
 * - **A failure is never kept.** A read that throws answers its waiters
 *   with the error, and the next caller tries again.
 * - **`stillGood` can retire an answer early**: a start in it has begun,
 *   or the business's day has turned.
 * - **Bounded.** At most `maxKeys` answers; past that the oldest goes. A
 *   caller choosing the key (a timetable's `?services=`) cannot grow it.
 * - **Per process**, like the rate limiter: two API replicas keep two.
 */
export class LiveReadCache<T> {
    private readonly kept = new Map<string, { value: T; at: number }>();
    private readonly flying = new Map<string, Promise<T>>();

    constructor(
        readonly ttlMs = 30_000,
        private readonly maxKeys = 2_000,
    ) {}

    async get(
        key: string,
        load: () => Promise<T>,
        now: number = Date.now(),
        stillGood: (value: T, now: number) => boolean = () => true,
    ): Promise<T> {
        const hit = this.kept.get(key);
        if (
            hit &&
            now >= hit.at &&
            now - hit.at < this.ttlMs &&
            stillGood(hit.value, now)
        ) {
            return hit.value;
        }
        const flying = this.flying.get(key);
        if (flying) return flying;

        const read = (async () => {
            try {
                const value = await load();
                this.keep(key, value, now);
                return value;
            } finally {
                this.flying.delete(key);
            }
        })();
        this.flying.set(key, read);
        return read;
    }

    /**
     * How much longer the kept answer for `key` is fresh, in whole seconds
     * (0: none kept). A shared cache in front may keep it that long and no
     * longer, so an answer is never older than `ttlMs` wherever it is kept.
     */
    secondsLeft(key: string, now: number = Date.now()): number {
        const hit = this.kept.get(key);
        if (!hit || now < hit.at) return 0;
        return Math.max(0, Math.floor((this.ttlMs - (now - hit.at)) / 1000));
    }

    /** Forget everything (tests, and a process that wants a clean start). */
    clear(): void {
        this.kept.clear();
    }

    private keep(key: string, value: T, at: number): void {
        // Re-inserted, so the Map's order stays oldest first.
        this.kept.delete(key);
        this.kept.set(key, { value, at });
        while (this.kept.size > this.maxKeys) {
            const oldest = this.kept.keys().next().value;
            if (oldest === undefined) break;
            this.kept.delete(oldest);
        }
    }
}
