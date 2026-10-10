import { correlationStorage } from "../logging/request-context";
import { structuredLogger } from "../logging/structured-logger";
import type { ServerErrorEvent } from "../observability/report-error";
import { setErrorSink } from "../observability/report-error";
import { authRouteTemplate, reportAuthServerError } from "./report-auth-error";

// A made-up reset link's last segment, built here so a secret scanner doesn't
// take it for a real one.
const TOKEN = ["Zk3pQ9", "vXa81L", "mN0tYb", "27RwHs"].join("");

describe("authRouteTemplate", () => {
    it("replaces a reset token by where it sits, and drops the query", () => {
        expect(
            authRouteTemplate(
                `/api/auth/reset-password/${TOKEN}?callbackURL=https://x.test`,
            ),
        ).toBe("/api/auth/reset-password/:token");
        // Even one that doesn't look like an id.
        expect(authRouteTemplate("/api/auth/reset-password/abc")).toBe(
            "/api/auth/reset-password/:token",
        );
    });

    it("leaves a plain auth route alone", () => {
        expect(authRouteTemplate("/api/auth/sign-in/social")).toBe(
            "/api/auth/sign-in/social",
        );
        expect(
            authRouteTemplate("/api/auth/callback/google?code=1&state=2"),
        ).toBe("/api/auth/callback/google");
    });
});

describe("reportAuthServerError", () => {
    let logError: jest.SpyInstance;
    let seen: ServerErrorEvent[];

    beforeEach(() => {
        logError = jest
            .spyOn(structuredLogger, "error")
            .mockImplementation(() => undefined);
        jest.spyOn(structuredLogger, "warn").mockImplementation(
            () => undefined,
        );
        seen = [];
        setErrorSink({ capture: (event) => seen.push(event) });
    });

    afterEach(() => {
        setErrorSink(null);
        jest.restoreAllMocks();
    });

    it("reports once, with the route's shape, the method, the status and the request id", () => {
        correlationStorage.run(
            {
                correlationId: "req-auth-1",
                method: "POST",
                path: `/api/auth/reset-password/${TOKEN}`,
            },
            () => {
                reportAuthServerError({
                    error: new Error(
                        "could not mail asha@example.com password=hunter2",
                    ),
                    status: 500,
                });
            },
        );

        expect(seen).toEqual([
            {
                name: "Error",
                message: expect.any(String) as string,
                stack: expect.any(String) as string,
                correlationId: "req-auth-1",
                statusCode: 500,
                method: "POST",
                route: "/api/auth/reset-password/:token",
            },
        ]);
        expect(logError).toHaveBeenCalledTimes(1);

        // Nothing of the request or the person, in the event or the log line.
        const everything = JSON.stringify([seen, logError.mock.calls]);
        expect(everything).not.toContain(TOKEN);
        expect(everything).not.toContain("asha@example.com");
        expect(everything).not.toContain("hunter2");
        expect(everything).not.toContain("cookie");
        const line = (logError.mock.calls[0] as unknown[])[1] as Record<
            string,
            unknown
        >;
        expect(line.path).toBe("/api/auth/reset-password/:token");
        expect(line.headers).toBeUndefined();
    });

    it("still reports outside a request, without a route", () => {
        reportAuthServerError({ error: new Error("boom"), status: 503 });
        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({
            correlationId: "unknown",
            statusCode: 503,
        });
        expect(seen[0]?.route).toBeUndefined();
    });

    it("never throws into the auth flow", () => {
        logError.mockImplementation(() => {
            throw new Error("the log stream is gone");
        });
        expect(() => {
            reportAuthServerError({ error: new Error("boom"), status: 500 });
        }).not.toThrow();
    });
});
