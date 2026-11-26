import type { ExecutionContext } from "@nestjs/common";
import { HttpException } from "@nestjs/common";

import { FixedWindowRateLimiter } from "../rate-limits/fixed-window";
import { ApiKeyGuard } from "./api-key.guard";
import type { ApiKeysService } from "./api-keys.service";
import { countWrongKey, WRONG_KEYS_PER_MINUTE } from "./wrong-key-limit";

const req = (address: string) => ({
    headers: {},
    socket: { remoteAddress: address },
    ip: address,
});
const res = () => {
    const headers: Record<string, string> = {};
    return {
        headers,
        setHeader: (name: string, value: string) => {
            headers[name] = value;
        },
    };
};

async function statusOf(run: Promise<unknown>): Promise<number | "ok"> {
    try {
        await run;
        return "ok";
    } catch (error) {
        if (error instanceof HttpException) return error.getStatus();
        throw error;
    }
}

describe("countWrongKey", () => {
    it("lets an address's wrong keys through to their 401 until its window is used, then answers 429", async () => {
        const limiter = new FixedWindowRateLimiter(3, 60_000);
        const answer = res();
        for (let i = 0; i < 3; i++) {
            expect(
                await statusOf(
                    countWrongKey(req("203.0.113.7"), answer, limiter),
                ),
            ).toBe("ok");
        }
        expect(
            await statusOf(countWrongKey(req("203.0.113.7"), answer, limiter)),
        ).toBe(429);
        expect(Number(answer.headers["Retry-After"])).toBeGreaterThan(0);
        // Another address has its own window.
        expect(
            await statusOf(countWrongKey(req("198.51.100.9"), res(), limiter)),
        ).toBe("ok");
    });

    it("answers in the public contract's shape", async () => {
        const limiter = new FixedWindowRateLimiter(1, 60_000);
        await countWrongKey(req("203.0.113.8"), res(), limiter);
        try {
            await countWrongKey(req("203.0.113.8"), res(), limiter);
            throw new Error("expected a 429");
        } catch (error) {
            expect((error as HttpException).getResponse()).toEqual({
                error: {
                    code: "rate_limited",
                    message: expect.stringContaining("Try again in"),
                },
            });
        }
    });
});

describe("ApiKeyGuard with wrong keys", () => {
    const keys = { findUsableByToken: jest.fn() } as unknown as ApiKeysService;
    const guard = new ApiKeyGuard(
        keys,
        {} as never,
        {} as never,
        {} as never,
        { isEnabled: async () => true } as never,
    );
    const wrong = `sk_live_${"A".repeat(43)}`;
    // A fresh address each run, should a Redis be set where the specs run.
    const fresh = () =>
        `198.18.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    const call = (address: string, token: string) => {
        const request = {
            path: "/v1/products",
            method: "GET",
            headers: { authorization: `Bearer ${token}` },
            socket: { remoteAddress: address },
            ip: address,
        };
        const context = {
            switchToHttp: () => ({
                getRequest: () => request,
                getResponse: () => res(),
            }),
        } as unknown as ExecutionContext;
        return statusOf(guard.canActivate(context));
    };

    it("answers 401 for a wrong key, then 429 once the address has sent too many", async () => {
        jest.spyOn(guard, "contextFor").mockResolvedValue(null);
        const address = fresh();
        const answers: (number | "ok")[] = [];
        for (let i = 0; i <= WRONG_KEYS_PER_MINUTE; i++) {
            answers.push(await call(address, wrong));
        }
        expect(answers.slice(0, WRONG_KEYS_PER_MINUTE)).toEqual(
            Array(WRONG_KEYS_PER_MINUTE).fill(401),
        );
        expect(answers.at(-1)).toBe(429);
    });

    it("never counts a key that works, and never refuses one for the address's misses", async () => {
        const spy = jest.spyOn(guard, "contextFor");
        spy.mockResolvedValue(null);
        const address = fresh();
        for (let i = 0; i <= WRONG_KEYS_PER_MINUTE; i++) {
            await call(address, wrong);
        }
        // A real key from the same address goes on to its own checks: here
        // the kind check, which a publishable key on /v1 fails with 403.
        spy.mockResolvedValue({
            key: { kind: "PUBLISHABLE" },
            context: {},
        } as never);
        expect(await call(address, `pk_live_${"B".repeat(43)}`)).toBe(403);
    });
});
