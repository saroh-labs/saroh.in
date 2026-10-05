import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(
    (): {
        API_URL?: string;
        SITE_RELAY_SECRET?: string;
        NODE_ENV: string;
    } => ({
        API_URL: "https://api.example.test",
        SITE_RELAY_SECRET: undefined,
        NODE_ENV: "test",
    }),
);
vi.mock("@/env", () => ({ env }));

import { POST as UNLOCK } from "./report/route";
import { POST as CHECK } from "./route";

/**
 * The link preview routes (resources plan U2): they ask the API server to
 * server, always with the visitor's address signed in (the API refuses
 * them without it), the address in the body, never a query string; and
 * every answer the page reads is a typed state — a limit, an API that's
 * down or missing, no secret to sign with — never a thrown error.
 */

const fetchMock = vi.fn();
const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    env.API_URL = "https://api.example.test";
    env.SITE_RELAY_SECRET = undefined;
    env.NODE_ENV = "test";
});
afterEach(() => {
    fetchMock.mockReset();
    errors.mockClear();
    vi.unstubAllGlobals();
});

const upstream = (status: number, body: unknown = {}) => ({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
});

const post = (path: string, body: unknown, headers: HeadersInit = {}) =>
    new Request(`https://www.saroh.in${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-real-ip": "203.0.113.9",
            ...headers,
        },
        body: JSON.stringify(body),
    });

const check = (body: unknown, headers?: HeadersInit) =>
    CHECK(post("/api/link-preview", body, headers));
const unlock = (body: unknown) =>
    UNLOCK(post("/api/link-preview/report", body));

describe("POST /api/link-preview (check)", () => {
    it("posts the address to the API in the body, signed, and passes the check through", async () => {
        const answer = {
            ok: true,
            url: "https://shop.in/",
            score: "Looks right on all 6 apps. Nothing to fix.",
        };
        fetchMock.mockResolvedValue(upstream(200, answer));
        const res = await check({ url: "https://shop.in/?a=1", fresh: true });
        expect(await res.json()).toEqual(answer);
        const [called, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(called).toBe(
            "https://api.example.test/public/tools/link-preview",
        );
        expect(called).not.toContain("?");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({
            url: "https://shop.in/?a=1",
            fresh: true,
        });
        expect(
            (init.headers as Record<string, string>)["x-saroh-relay"],
        ).toMatch(/^v1\./);
    });

    it("signs the relay even with no platform header in front", async () => {
        fetchMock.mockResolvedValue(upstream(200, { ok: true }));
        await CHECK(
            new Request("http://localhost:3002/api/link-preview", {
                method: "POST",
                body: JSON.stringify({ url: "shop.in" }),
            }),
        );
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(
            (init.headers as Record<string, string>)["x-saroh-relay"],
        ).toMatch(/^v1\./);
    });

    it.each([
        [429, "rate-limited"],
        [500, "unavailable"],
        [401, "unavailable"],
        [400, "invalid"],
    ])("answers the API's %s as %s", async (status, failure) => {
        fetchMock.mockResolvedValue(upstream(status));
        const res = await check({ url: "shop.in" });
        expect(await res.json()).toMatchObject({ ok: false, failure });
    });

    it("answers unavailable when the API can't be reached or isn't configured", async () => {
        fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
        expect(await (await check({ url: "shop.in" })).json()).toMatchObject({
            failure: "unavailable",
        });
        env.API_URL = undefined;
        expect(await (await check({ url: "shop.in" })).json()).toMatchObject({
            failure: "unavailable",
        });
    });

    it("answers 503 with a logged error, calling nothing, when there is no relay secret", async () => {
        env.NODE_ENV = "production";
        const res = await check({ url: "shop.in" });
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({ failure: "unavailable" });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(String(errors.mock.calls[0]?.[0])).toContain(
            "SITE_RELAY_SECRET",
        );
    });

    it("refuses an empty address without calling the API", async () => {
        const res = await check({});
        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("POST /api/link-preview/report (unlock)", () => {
    it("sends only the email and the address — no consent, nothing else", async () => {
        fetchMock.mockResolvedValue(
            upstream(200, {
                unlocked: true,
                emailed: "sent",
                fixes: [],
                suggestedTags: "",
            }),
        );
        await unlock({
            email: " a@shop.in ",
            url: "https://shop.in/",
            consent: true,
            extra: 1,
        });
        const [called, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(called).toBe(
            "https://api.example.test/public/tools/link-preview/report",
        );
        expect(JSON.parse(init.body as string)).toEqual({
            email: "a@shop.in",
            url: "https://shop.in/",
        });
        expect(
            (init.headers as Record<string, string>)["x-saroh-relay"],
        ).toMatch(/^v1\./);
    });

    it("answers a refused email as bad-email, and no email without asking", async () => {
        fetchMock.mockResolvedValue(upstream(400));
        expect(
            await (await unlock({ email: "x", url: "shop.in" })).json(),
        ).toEqual({ unlocked: false, failure: "bad-email" });
        const missing = await unlock({ url: "shop.in" });
        expect(await missing.json()).toEqual({
            unlocked: false,
            failure: "bad-email",
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("answers 503 with a logged error when there is no relay secret", async () => {
        env.NODE_ENV = "production";
        const res = await unlock({ email: "a@shop.in", url: "shop.in" });
        expect(res.status).toBe(503);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(String(errors.mock.calls[0]?.[0])).toContain(
            "SITE_RELAY_SECRET",
        );
    });
});
