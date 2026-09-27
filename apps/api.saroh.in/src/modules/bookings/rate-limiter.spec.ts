import { FixedWindowRateLimiter } from "./rate-limiter";

describe("FixedWindowRateLimiter", () => {
    it("allows `limit` hits per window, then refuses until it resets", () => {
        const limiter = new FixedWindowRateLimiter(2, 60_000);
        expect(limiter.take("a", 0)).toBe(true);
        expect(limiter.take("a", 1_000)).toBe(true);
        expect(limiter.take("a", 2_000)).toBe(false);
        expect(limiter.take("b", 2_000)).toBe(true);
        expect(limiter.take("a", 60_000)).toBe(true);
    });

    it("says how long until a key's window resets", () => {
        const limiter = new FixedWindowRateLimiter(1, 60_000);
        limiter.take("a", 0);
        expect(limiter.retryAfterSeconds("a", 15_500)).toBe(45);
        expect(limiter.retryAfterSeconds("a", 59_999)).toBe(1);
        expect(limiter.retryAfterSeconds("unknown", 0)).toBe(1);
    });
});
