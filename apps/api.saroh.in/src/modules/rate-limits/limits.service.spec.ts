import { HttpException, Logger } from "@nestjs/common";
import RedisMock from "ioredis-mock";

import { LimitsService } from "./limits.service";
import { gcraStep, MemoryWindow } from "./memory-window";

const T0 = 1_800_000_000_000;

function fakeRes() {
    const headers: Record<string, string> = {};
    return {
        headers,
        setHeader: (name: string, value: string) => {
            headers[name] = value;
        },
    };
}

async function expect429(
    limits: LimitsService,
    scope: "mcp" | "secret",
    id: string,
    cap: number,
    now: number,
) {
    const res = fakeRes();
    const err = await limits.enforce(res as never, scope, id, cap, now).then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).getResponse()).toEqual({
        error: { code: "rate_limited", message: expect.any(String) },
    });
    expect(res.headers["RateLimit-Remaining"]).toBe("0");
    expect(Number(res.headers["Retry-After"])).toBeGreaterThanOrEqual(1);
    return res.headers;
}

describe("LimitsService with Redis (the Lua window)", () => {
    let redis: InstanceType<typeof RedisMock>;
    beforeEach(async () => {
        redis = new RedisMock();
        await redis.flushall();
    });

    it("lets N calls through, then refuses N+1 with 429 and headers", async () => {
        const limits = new LimitsService(redis as never);
        for (let i = 0; i < 5; i++) {
            const res = fakeRes();
            await limits.enforce(res as never, "secret", "org-1", 5, T0 + i);
            expect(res.headers["RateLimit-Limit"]).toBe("5");
            expect(res.headers["RateLimit-Remaining"]).toBe(String(4 - i));
            expect(res.headers["Retry-After"]).toBeUndefined();
        }
        const headers = await expect429(limits, "secret", "org-1", 5, T0 + 5);
        expect(headers["Retry-After"]).toBe("12");
        // Another business has its own window.
        await limits.enforce(fakeRes() as never, "secret", "org-2", 5, T0 + 5);
    });

    it("frees one call per interval and the whole window after a minute", async () => {
        const limits = new LimitsService(redis as never);
        for (let i = 0; i < 3; i++)
            expect((await limits.take("mcp", "k", 3, T0)).allowed).toBe(true);
        expect((await limits.take("mcp", "k", 3, T0 + 19_999)).allowed).toBe(
            false,
        );
        expect((await limits.take("mcp", "k", 3, T0 + 20_000)).allowed).toBe(
            true,
        );
        // A minute after the last call the window is full again.
        const later = T0 + 80_000;
        for (let i = 0; i < 3; i++)
            expect((await limits.take("mcp", "k", 3, later)).allowed).toBe(
                true,
            );
        expect((await limits.take("mcp", "k", 3, later)).allowed).toBe(false);
    });

    it("counts the window's calls without taking one (Usage)", async () => {
        const limits = new LimitsService(redis as never);
        expect(await limits.used("secret", "org-u", 6, T0)).toBe(0);
        for (let i = 0; i < 4; i++) await limits.take("secret", "org-u", 6, T0);
        expect(await limits.used("secret", "org-u", 6, T0)).toBe(4);
        expect(await limits.used("secret", "org-u", 6, T0)).toBe(4);
        // One interval (10 s at 6 a minute) frees one; a minute frees all.
        expect(await limits.used("secret", "org-u", 6, T0 + 10_000)).toBe(3);
        expect(await limits.used("secret", "org-u", 6, T0 + 60_000)).toBe(0);
    });

    it("refuses everything at a cap of 0", async () => {
        const limits = new LimitsService(redis as never);
        expect((await limits.take("storefront", "o", 0, T0)).allowed).toBe(
            false,
        );
    });
});

describe("LimitsService failing open", () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    });
    afterEach(() => warn.mockRestore());

    it("on a Redis error still refuses N+1, warning once per burst", async () => {
        const broken = {
            eval: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
            quit: jest.fn(),
        };
        // Two replicas: each holds half the cap in process.
        const limits = new LimitsService(broken as never, 2);
        for (let i = 0; i < 3; i++)
            await limits.enforce(fakeRes() as never, "secret", "org", 6, T0);
        await expect429(limits, "secret", "org", 6, T0);
        const opens = warn.mock.calls.filter((c) =>
            String(c[0]).startsWith("rate_limit_open reason=redis_error"),
        );
        expect(opens).toHaveLength(1);
        expect(limits.openCount).toBe(4);
        // The next minute's first fallback warns again, counting the quiet ones.
        await limits.take("secret", "org", 6, T0 + 60_000);
        expect(warn).toHaveBeenLastCalledWith(
            expect.stringContaining("calls=4"),
        );
    });

    it("counts this replica's calls when Redis fails", async () => {
        const broken = {
            eval: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
            quit: jest.fn(),
        };
        const limits = new LimitsService(broken as never);
        await limits.take("mcp", "org", 5, T0);
        await limits.take("mcp", "org", 5, T0);
        expect(await limits.used("mcp", "org", 5, T0)).toBe(2);
    });

    it("with no REDIS_URL limits in process and says so once", async () => {
        const limits = new LimitsService(null);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("rate_limit_open reason=no_redis"),
        );
        for (let i = 0; i < 2; i++)
            await limits.enforce(fakeRes() as never, "mcp", "conn", 2, T0);
        await expect429(limits, "mcp", "conn", 2, T0);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});

describe("gcraStep", () => {
    it("allows exactly the cap in a burst for a cap that doesn't divide a minute", () => {
        const w = new MemoryWindow();
        for (let i = 0; i < 7; i++)
            expect(w.take("k", 7, T0).allowed).toBe(true);
        expect(w.take("k", 7, T0).allowed).toBe(false);
    });

    it("says when the window is full again", () => {
        const step = gcraStep(null, T0, 4);
        expect(step).toMatchObject({ allowed: true, remaining: 3 });
        expect(step.resetAt).toBe(T0 + 15_000);
    });
});
