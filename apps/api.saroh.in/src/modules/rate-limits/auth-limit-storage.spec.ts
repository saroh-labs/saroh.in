import RedisMock from "ioredis-mock";

import { authLimitStorage } from "./auth-limit-storage";

// 03-M7: Better Auth's sign-in limit lived in each process's memory.
describe("authLimitStorage", () => {
    it("is shared through Redis: a second replica sees the first one's tries", async () => {
        const redis = new RedisMock();
        const one = authLimitStorage(redis);
        const two = authLimitStorage(redis);
        const rule = { window: 10, max: 3 };
        for (let i = 0; i < 3; i++) {
            await expect(
                (i % 2 ? one : two)!.consume(
                    "203.0.113.9|/sign-in/email",
                    rule,
                ),
            ).resolves.toEqual({ allowed: true, retryAfter: null });
        }
        const refused = await one!.consume("203.0.113.9|/sign-in/email", rule);
        expect(refused.allowed).toBe(false);
        expect(refused.retryAfter).toBeGreaterThanOrEqual(1);
        expect(refused.retryAfter).toBeLessThanOrEqual(10);
        // Another rule (a path with its own window) counts on its own.
        await expect(
            one!.consume("203.0.113.9|/sign-in/email", { window: 60, max: 3 }),
        ).resolves.toMatchObject({ allowed: true });
    });

    it("leaves Better Auth its own store with no Redis", () => {
        expect(authLimitStorage(null)).toBeUndefined();
    });
});
