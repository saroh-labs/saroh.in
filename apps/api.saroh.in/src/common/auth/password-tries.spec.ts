import { FixedWindowRateLimiter } from "../../modules/rate-limits/fixed-window";
import { passwordTries } from "./password-tries";

describe("passwordTries (A-03)", () => {
    it("blocks an address after its wrong passwords, whatever the case, until the window turns", async () => {
        const tries = passwordTries(
            new FixedWindowRateLimiter(3, 60_000),
            new FixedWindowRateLimiter(6, 60_000),
        );
        for (let i = 0; i < 3; i++) {
            await expect(tries.blocked("a@example.com")).resolves.toBeNull();
            await tries.failed("A@example.com");
        }
        await expect(tries.blocked("a@example.com")).resolves.toEqual({
            retryAfterSeconds: expect.any(Number),
        });
        await expect(tries.blocked("b@example.com")).resolves.toBeNull();
    });

    it("stops a parallel burst at the attempt limit before any fail is counted (L7)", async () => {
        const tries = passwordTries(
            new FixedWindowRateLimiter(3, 60_000),
            new FixedWindowRateLimiter(6, 60_000),
        );
        const answers = await Promise.all(
            Array.from({ length: 20 }, () => tries.blocked("a@example.com")),
        );
        expect(answers.filter((a) => a === null)).toHaveLength(6);
        // Known or unknown, the answer is the same shape.
        expect(answers[19]).toEqual({ retryAfterSeconds: expect.any(Number) });
    });
});
