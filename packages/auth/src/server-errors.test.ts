import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { APIError } from "better-auth/api";
import { describe, expect, it, vi } from "vitest";

import type { AuthServerFault } from "./server-errors";
import { serverErrorHook, serverFaultStatus } from "./server-errors";

describe("serverFaultStatus", () => {
    it("is null for an expected outcome", () => {
        for (const status of [
            "BAD_REQUEST",
            "UNAUTHORIZED",
            "FORBIDDEN",
            "NOT_FOUND",
            "UNPROCESSABLE_ENTITY",
            "TOO_MANY_REQUESTS",
            "FOUND",
        ] as const) {
            expect(serverFaultStatus(new APIError(status))).toBeNull();
        }
    });

    it("is the status for a server fault, and 500 for anything else thrown", () => {
        expect(serverFaultStatus(new APIError("INTERNAL_SERVER_ERROR"))).toBe(
            500,
        );
        expect(serverFaultStatus(new APIError("SERVICE_UNAVAILABLE"))).toBe(
            503,
        );
        expect(serverFaultStatus(new Error("the database went away"))).toBe(
            500,
        );
        expect(serverFaultStatus("a string")).toBe(500);
        // Not Better Auth's error, so its own status is not what is answered.
        expect(
            serverFaultStatus(
                Object.assign(new Error("upstream"), { statusCode: 404 }),
            ),
        ).toBe(500);
    });
});

describe("serverErrorHook", () => {
    const ctx = { logger: { error: vi.fn() } } as never;

    it("swallows whatever the host's reporter throws", () => {
        const hook = serverErrorHook(() => {
            throw new Error("the tracker is down");
        });
        expect(() => hook.onError?.(new Error("boom"), ctx)).not.toThrow();
    });
});

/**
 * The real thing: Better Auth's own handler, with the hook installed the way
 * `createAuth` installs it. Proves the installed version calls
 * `onAPIError.onError` for what it answers 5xx, and that a 4xx is not passed
 * on. No database: the in-memory adapter.
 */
describe("Better Auth's handler, with the hook", () => {
    const BASE = "https://api.saroh.test";

    function build() {
        const faults: AuthServerFault[] = [];
        const auth = betterAuth({
            secret: "test-secret-test-secret-test-secret-1234",
            baseURL: BASE,
            trustedOrigins: [BASE],
            database: memoryAdapter({
                user: [],
                session: [],
                account: [],
                verification: [],
            }),
            emailAndPassword: { enabled: true },
            // No keys, as on a host where Google sign-in was never set up.
            socialProviders: { google: { clientId: "", clientSecret: "" } },
            logger: { disabled: true },
            onAPIError: serverErrorHook((fault) => faults.push(fault)),
        });
        const post = (path: string, body: unknown) =>
            auth.handler(
                new Request(`${BASE}/api/auth${path}`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        origin: BASE,
                    },
                    body: JSON.stringify(body),
                }),
            );
        return { faults, post };
    }

    it("a 5xx reaches the host once: social sign-in with no provider keys", async () => {
        const { faults, post } = build();
        const res = await post("/sign-in/social", {
            provider: "google",
            callbackURL: `${BASE}/`,
        });
        expect(res.status).toBe(500);
        expect(faults).toHaveLength(1);
        expect(faults[0]?.status).toBe(500);
        // Only the thrown value and the status: nothing of the request.
        expect(Object.keys(faults[0] ?? {}).sort()).toEqual([
            "error",
            "status",
        ]);
    });

    it("a 4xx does not: a wrong password, and a body that fails validation", async () => {
        const { faults, post } = build();
        const wrong = await post("/sign-in/email", {
            email: "asha@example.com",
            password: "not-the-password",
        });
        expect(wrong.status).toBe(401);
        const invalid = await post("/sign-in/email", { email: 42 });
        expect(invalid.status).toBe(400);
        expect(faults).toEqual([]);
    });
});
