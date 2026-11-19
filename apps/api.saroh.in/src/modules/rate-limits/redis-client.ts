import Redis from "ioredis";

import { env } from "../../env";

/** A client that fails fast, so a Redis outage costs a call ~nothing. */
export function connectRedis(url: string | undefined): Redis | null {
    if (!url) return null;
    const redis = new Redis(url, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        commandTimeout: 250,
    });
    // Every failing call already logs `rate_limit_open`; without a listener
    // ioredis prints each reconnect error itself.
    redis.on("error", () => undefined);
    return redis;
}

let shared: Redis | null | undefined;

/**
 * The one Redis connection the API's limiters share (`REDIS_URL`): the
 * public API's GCRA windows (`LimitsService`) and every
 * {@link SharedRateLimiter}. `null` when `REDIS_URL` is unset.
 */
export function sharedRedis(): Redis | null {
    if (shared === undefined) shared = connectRedis(env.REDIS_URL);
    return shared;
}
