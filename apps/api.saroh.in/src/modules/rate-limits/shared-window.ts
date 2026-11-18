import { Logger } from "@nestjs/common";
import type Redis from "ioredis";

import { FixedWindowRateLimiter } from "./fixed-window";
import { sharedRedis } from "./redis-client";

/** At most one fallback WARN a minute per process; the rest are counted into it. */
const WARN_EVERY_MS = 60_000;

const logger = new Logger("SharedRateLimiter");
let warnedNoRedis = false;
let lastWarnAt = Number.NEGATIVE_INFINITY;
let unwarned = 0;

/**
 * One fixed window per key, counted atomically: the first hit starts the
 * window's clock. Returns the count after this hit and the ms left.
 */
export const FIXED_WINDOW_LUA = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

/**
 * What a caller holds when it takes a hit: a {@link SharedRateLimiter} in
 * the API, or a {@link FixedWindowRateLimiter} a spec hands in. Always
 * awaited.
 */
export interface WindowLimiter {
    take(key: string, now?: number): boolean | Promise<boolean>;
    retryAfterSeconds(key: string, now?: number): number | Promise<number>;
}

/**
 * {@link FixedWindowRateLimiter}'s rule, kept in Redis so every replica
 * shares one window and a deploy does not empty it (03-M7, 05-P-03). For
 * the limits that guard money, sends or outbound work: codes, sign-in,
 * enquiries and contact, booking holds, coupon tries, share-card renders,
 * public pay.
 *
 * Degraded path: with `REDIS_URL` unset, or on any Redis error, it limits
 * in this process exactly as the in-memory class does, and says so at WARN
 * (`rate_limit_open`, once for no Redis, at most once a minute for errors).
 */
export class SharedRateLimiter implements WindowLimiter {
    private readonly memory: FixedWindowRateLimiter;
    private readonly redis: Pick<Redis, "eval"> | null;

    /**
     * @param name     the limit's own name, part of every Redis key
     * @param limit    max hits allowed per window
     * @param windowMs window length in ms
     * @param redis    the client; the API's shared one unless a spec passes its own
     */
    constructor(
        private readonly name: string,
        private readonly limit = 5,
        private readonly windowMs = 60_000,
        redis?: Pick<Redis, "eval"> | null,
    ) {
        this.memory = new FixedWindowRateLimiter(limit, windowMs);
        this.redis = redis === undefined ? sharedRedis() : redis;
    }

    /** Record a hit for `key`: `true` within the limit, `false` past it (429). */
    async take(key: string, now: number = Date.now()): Promise<boolean> {
        if (this.redis) {
            try {
                const [count] = (await this.redis.eval(
                    FIXED_WINDOW_LUA,
                    1,
                    this.key(key),
                    String(this.windowMs),
                )) as [number, number];
                return count <= this.limit;
            } catch (error) {
                fellBack(error, now);
            }
        } else if (!warnedNoRedis) {
            warnedNoRedis = true;
            logger.warn(
                "rate_limit_open reason=no_redis: REDIS_URL is unset, so public limits are kept in process on each replica and reset on deploy",
            );
        }
        return this.memory.take(key, now);
    }

    /** Seconds until `key`'s window resets: at least 1. */
    async retryAfterSeconds(
        key: string,
        now: number = Date.now(),
    ): Promise<number> {
        if (this.redis) {
            try {
                const ttl = (await this.redis.eval(
                    "return redis.call('PTTL', KEYS[1])",
                    1,
                    this.key(key),
                )) as number;
                return Math.max(1, Math.ceil(ttl / 1000));
            } catch (error) {
                fellBack(error, now);
            }
        }
        return this.memory.retryAfterSeconds(key, now);
    }

    private key(key: string): string {
        return `fw:${this.name}:${key}`;
    }
}

function fellBack(error: unknown, now: number): void {
    unwarned += 1;
    if (now - lastWarnAt < WARN_EVERY_MS) return;
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(
        `rate_limit_open reason=redis_error calls=${unwarned} error=${reason}`,
    );
    lastWarnAt = now;
    unwarned = 0;
}
