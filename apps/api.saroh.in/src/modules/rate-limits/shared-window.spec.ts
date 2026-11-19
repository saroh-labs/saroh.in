import RedisMock from "ioredis-mock";

import { SharedRateLimiter } from "./shared-window";

describe("SharedRateLimiter", () => {
    it("counts in Redis, so two replicas (or a restart) share one window", async () => {
        const redis = new RedisMock();
        const one = new SharedRateLimiter("t-shared", 2, 60_000, redis);
        const two = new SharedRateLimiter("t-shared", 2, 60_000, redis);
        expect(await one.take("addr")).toBe(true);
        expect(await two.take("addr")).toBe(true);
        // A third hit on either replica is refused: no per-process window.
        expect(await one.take("addr")).toBe(false);
        expect(await two.take("addr")).toBe(false);
        expect(await one.take("other")).toBe(true);
        const wait = await one.retryAfterSeconds("addr");
        expect(wait).toBeGreaterThanOrEqual(1);
        expect(wait).toBeLessThanOrEqual(60);
    });

    it("keeps separate windows per limit name", async () => {
        const redis = new RedisMock();
        const a = new SharedRateLimiter("t-a", 1, 60_000, redis);
        const b = new SharedRateLimiter("t-b", 1, 60_000, redis);
        expect(await a.take("k")).toBe(true);
        expect(await b.take("k")).toBe(true);
        expect(await a.take("k")).toBe(false);
    });

    it("limits in process when Redis fails, never letting everything through", async () => {
        const broken = {
            eval: () => Promise.reject(new Error("down")),
        };
        const limiter = new SharedRateLimiter("t-broken", 1, 60_000, broken);
        expect(await limiter.take("k", 0)).toBe(true);
        expect(await limiter.take("k", 1)).toBe(false);
        expect(await limiter.retryAfterSeconds("k", 1)).toBe(60);
    });

    it("limits in process with no Redis at all", async () => {
        const limiter = new SharedRateLimiter("t-none", 1, 60_000, null);
        expect(await limiter.take("k", 0)).toBe(true);
        expect(await limiter.take("k", 1)).toBe(false);
        expect(await limiter.take("k", 60_000)).toBe(true);
    });
});
