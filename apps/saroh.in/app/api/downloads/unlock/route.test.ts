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

import { GET, POST } from "./route";

/**
 * The downloads' gate route (plan 2026-10-31-002 U9): signed, server to
 * server, with the slug, one contact and the Turnstile token and nothing
 * else; each API refusal is its own reason; an unknown download is
 * "unavailable" and logged, never a bad contact.
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
const URL_ = "https://www.saroh.in/api/downloads/unlock";
const unlock = (body: unknown) =>
    POST(
        new Request(URL_, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "cf-connecting-ip": "203.0.113.9",
            },
            body: JSON.stringify(body),
        }),
    );
const SLUG = "customer-list-template";

describe("POST /api/downloads/unlock", () => {
    it("sends the slug, one contact and the token, signed, and nothing else", async () => {
        fetchMock.mockResolvedValue(
            upstream(200, { unlocked: true, emailed: "sent", id: "x" }),
        );
        const res = await unlock({
            slug: SLUG,
            email: " a@shop.example.com ",
            turnstileToken: "tok",
            consent: true,
            tips: true,
        });
        expect(await res.json()).toEqual({ unlocked: true, emailed: "sent" });
        const [called, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(called).toBe("https://api.example.test/public/downloads/unlock");
        expect(JSON.parse(init.body as string)).toEqual({
            slug: SLUG,
            email: "a@shop.example.com",
            turnstileToken: "tok",
        });
        expect(
            (init.headers as Record<string, string>)["x-saroh-relay"],
        ).toMatch(/^v1\./);
    });

    it("sends a phone lead's number and reads `none`", async () => {
        fetchMock.mockResolvedValue(
            upstream(200, { unlocked: true, emailed: "none" }),
        );
        const res = await unlock({ slug: SLUG, phone: "98450 12345" });
        expect(await res.json()).toEqual({ unlocked: true, emailed: "none" });
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(JSON.parse(init.body as string)).toEqual({
            slug: SLUG,
            phone: "98450 12345",
        });
    });

    it.each([
        [{ slug: SLUG }],
        [{ slug: SLUG, email: "a@example.com", phone: "9845012345" }],
    ])("refuses both or neither contact without asking the API", async (b) => {
        const res = await unlock(b);
        expect(await res.json()).toEqual({
            unlocked: false,
            failure: "bad-contact",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("answers a slug of no download's shape as unavailable, logged", async () => {
        const res = await unlock({ slug: "../x", email: "a@example.com" });
        expect(await res.json()).toEqual({
            unlocked: false,
            failure: "unavailable",
        });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(errors).toHaveBeenCalled();
    });

    it.each([
        [429, "rate-limited"],
        [400, "bad-contact"],
        [403, "challenge"],
        [401, "unavailable"],
        [500, "unavailable"],
    ])("answers the API's %s as %s", async (status, failure) => {
        fetchMock.mockResolvedValue(upstream(status));
        const res = await unlock({ slug: SLUG, email: "a@example.com" });
        expect(await res.json()).toEqual({ unlocked: false, failure });
    });

    it("answers an unknown download as unavailable and logs it, never a bad contact", async () => {
        fetchMock.mockResolvedValue(upstream(404));
        const res = await unlock({ slug: "not-ours", email: "a@example.com" });
        expect(await res.json()).toEqual({
            unlocked: false,
            failure: "unavailable",
        });
        expect(String(errors.mock.calls[0]?.[0])).toContain("not-ours");
    });

    it("answers unavailable when the API can't be reached or isn't configured", async () => {
        fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
        const b = { slug: SLUG, email: "a@example.com" };
        expect(await (await unlock(b)).json()).toEqual({
            unlocked: false,
            failure: "unavailable",
        });
        env.API_URL = undefined;
        expect(await (await unlock(b)).json()).toEqual({
            unlocked: false,
            failure: "unavailable",
        });
    });

    it("answers 503, calling nothing, when there is no relay secret", async () => {
        env.NODE_ENV = "production";
        const res = await unlock({ slug: SLUG, email: "a@example.com" });
        expect(res.status).toBe(503);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("GET /api/downloads/unlock", () => {
    it("passes on the Turnstile key", async () => {
        fetchMock.mockResolvedValue(upstream(200, { turnstileSiteKey: "k" }));
        const res = await GET(new Request(URL_));
        expect(await res.json()).toEqual({ turnstileSiteKey: "k" });
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            "https://api.example.test/public/downloads/options",
        );
    });

    it("answers null when the API is down", async () => {
        fetchMock.mockRejectedValue(new Error("down"));
        const res = await GET(new Request(URL_));
        expect(await res.json()).toEqual({ turnstileSiteKey: null });
    });
});
