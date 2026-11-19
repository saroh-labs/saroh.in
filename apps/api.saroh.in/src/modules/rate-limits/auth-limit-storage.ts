import type Redis from "ioredis";

import { SharedRateLimiter } from "./shared-window";

/**
 * Better Auth's sign-in, sign-up and code limits kept in Redis (03-M7,
 * 05-P-03): its default store is process memory, so a deploy emptied it
 * and each replica counted on its own. One fixed window per (rule, key),
 * through {@link SharedRateLimiter}, which falls back to the process at
 * WARN when Redis fails. Null with no Redis: Better Auth keeps its own.
 */
export function authLimitStorage(redis: Pick<Redis, "eval"> | null) {
    if (!redis) return undefined;
    const windows = new Map<string, SharedRateLimiter>();
    return {
        async consume(
            key: string,
            rule: { window: number; max: number },
        ): Promise<{ allowed: boolean; retryAfter: number | null }> {
            const name = `auth:${rule.window}:${rule.max}`;
            let limiter = windows.get(name);
            if (!limiter) {
                limiter = new SharedRateLimiter(
                    name,
                    rule.max,
                    rule.window * 1000,
                    redis,
                );
                windows.set(name, limiter);
            }
            if (await limiter.take(key)) {
                return { allowed: true, retryAfter: null };
            }
            return {
                allowed: false,
                retryAfter: await limiter.retryAfterSeconds(key),
            };
        },
    };
}
