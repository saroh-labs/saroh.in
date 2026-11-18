// Pure unit tests for the backoff helper. job-queue.port.ts has only type-only
// imports, so nothing touches a DB, the network, or env here.
import {
    BACKOFF_BASE_MS,
    BACKOFF_CAP_MS,
    laneOf,
    nextBackoff,
    retryDelay,
} from "./job-queue.port";

describe("nextBackoff", () => {
    it("is the base delay for the first retry", () => {
        // attempts=1 → base * 2^1 = 2 * base
        expect(nextBackoff(1)).toBe(BACKOFF_BASE_MS * 2);
        expect(nextBackoff(0)).toBe(BACKOFF_BASE_MS);
    });

    it("grows strictly while below the cap", () => {
        let prev = -1;
        // 2^8 * 1000 = 256_000 < cap (300_000); 2^9 would exceed it.
        for (let attempts = 0; attempts <= 8; attempts++) {
            const delay = nextBackoff(attempts);
            expect(delay).toBeGreaterThan(prev);
            expect(delay).toBeLessThanOrEqual(BACKOFF_CAP_MS);
            prev = delay;
        }
    });

    it("is pinned at the cap once exceeded and never goes above it", () => {
        expect(nextBackoff(9)).toBe(BACKOFF_CAP_MS);
        expect(nextBackoff(20)).toBe(BACKOFF_CAP_MS);
        // Very large attempts must not overflow to Infinity/0.
        expect(nextBackoff(1000)).toBe(BACKOFF_CAP_MS);
    });

    it("never returns a delay above the cap for any attempt", () => {
        for (let attempts = 0; attempts <= 100; attempts++) {
            expect(nextBackoff(attempts)).toBeLessThanOrEqual(BACKOFF_CAP_MS);
        }
    });
});

describe("retryDelay", () => {
    it("keeps the five-minute backoff for a job with no schedule", () => {
        expect(retryDelay("orders.notify", 3)).toBe(nextBackoff(3));
        expect(retryDelay("orders.notify", 30)).toBe(BACKOFF_CAP_MS);
    });

    it("spreads a merchant webhook's retries over about 16 hours", () => {
        const MIN = 60_000;
        expect(retryDelay("webhook.process", 1)).toBe(MIN);
        expect(retryDelay("webhook.process", 8)).toBe(480 * MIN);
        // Past the schedule, the last wait repeats.
        expect(retryDelay("webhook.process", 20)).toBe(480 * MIN);
        const total = [1, 2, 3, 4, 5, 6, 7, 8]
            .map((n) => retryDelay("webhook.process", n))
            .reduce((a, b) => a + b, 0);
        expect(total / (60 * MIN)).toBeGreaterThan(15);
    });

    it("waits minutes, not seconds, before retrying a Google Calendar sync (GC-05)", () => {
        const MIN = 60_000;
        const mid = () => 0.5;
        expect(retryDelay("calendar.sync", 1, mid)).toBe(MIN);
        expect(retryDelay("calendar.sync", 5, mid)).toBe(240 * MIN);
        const total = [1, 2, 3, 4, 5]
            .map((n) => retryDelay("calendar.sync", n, mid))
            .reduce((a, b) => a + b, 0);
        // A rate limit or an outage of hours still lands it.
        expect(total / (60 * MIN)).toBeGreaterThan(5);
    });

    it("spreads a Google Calendar retry by up to a fifth either way", () => {
        const MIN = 60_000;
        expect(retryDelay("calendar.sync", 2, () => 0)).toBe(4 * MIN);
        expect(retryDelay("calendar.sync", 2, () => 0.999_999)).toBeCloseTo(
            6 * MIN,
            -2,
        );
        // Other schedules stay exact.
        expect(retryDelay("webhook.process", 2, () => 0)).toBe(5 * MIN);
    });
});

describe("laneOf", () => {
    it("runs Google Calendar jobs on their own lane, everything else on main", () => {
        expect(laneOf("calendar.sync")).toBe("calendar");
        expect(laneOf("calendar.busy")).toBe("calendar");
        expect(laneOf("webhook.process")).toBe("main");
        expect(laneOf("booking.notify")).toBe("main");
    });
});
