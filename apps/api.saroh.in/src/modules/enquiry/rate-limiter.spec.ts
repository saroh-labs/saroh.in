import { FixedWindowRateLimiter } from "./rate-limiter";

/**
 * The in-process limiter counts hits per key per window, and holds no key
 * longer than it must: expired windows are swept, and the map has a ceiling.
 */
describe("FixedWindowRateLimiter", () => {
    it("allows `limit` hits per window, then refuses until it resets", () => {
        const limiter = new FixedWindowRateLimiter(2, 1_000);
        expect(limiter.take("a", 0)).toBe(true);
        expect(limiter.take("a", 10)).toBe(true);
        expect(limiter.take("a", 20)).toBe(false);
        expect(limiter.take("a", 1_000)).toBe(true);
    });

    it("sweeps expired keys instead of keeping every stranger forever", () => {
        const limiter = new FixedWindowRateLimiter(5, 1_000);
        for (let i = 0; i < 100; i += 1) limiter.take(`k${i}`, 0);
        expect(limiter.size).toBe(100);
        limiter.take("later", 2_000);
        expect(limiter.size).toBe(1);
    });

    it("caps the number of keys, dropping the oldest first", () => {
        const limiter = new FixedWindowRateLimiter(1, 60_000, 3);
        limiter.take("a", 0);
        limiter.take("b", 1);
        limiter.take("c", 2);
        limiter.take("d", 3);
        expect(limiter.size).toBe(3);
        // "a" was forgotten, so it may hit again; "d" may not.
        expect(limiter.take("d", 4)).toBe(false);
        expect(limiter.take("a", 5)).toBe(true);
    });
});
