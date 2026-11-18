import { FixedWindowRateLimiter } from "./fixed-window";

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

    it("sweeps expired keys instead of keeping every stranger forever", () => {
        const limiter = new FixedWindowRateLimiter(5, 1_000);
        for (let i = 0; i < 100; i += 1) limiter.take(`k${i}`, 0);
        expect(limiter.size).toBe(100);
        limiter.take("later", 2_000);
        expect(limiter.size).toBe(1);
    });

    // 03-M7: 10,000 fresh keys used to push every live window out, the
    // attacker's own first key included, so its limit started over.
    it("never forgets a live window, however many other keys arrive", () => {
        const limiter = new FixedWindowRateLimiter(1, 60_000);
        expect(limiter.take("victim", 0)).toBe(true);
        for (let i = 0; i < 20_000; i += 1) limiter.take(`flood${i}`, 1);
        expect(limiter.take("victim", 2)).toBe(false);
        expect(limiter.size).toBe(20_001);
    });
});
