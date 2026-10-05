import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(
    (): { API_URL?: string; SITE_RELAY_SECRET?: string; NODE_ENV: string } => ({
        API_URL: "https://api.example.test",
        SITE_RELAY_SECRET: undefined,
        NODE_ENV: "test",
    }),
);
vi.mock("@/env", () => ({ env }));

import { GET, POST } from "./route";

/**
 * The link preview route (resources plan U2): it asks the API server to
 * server with the visitor's address signed in, and every answer the page
 * reads is a typed state — a limit, an API that's down or missing — never
 * a thrown error.
 */

const fetchMock = vi.fn();

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    env.API_URL = "https://api.example.test";
});
afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
});

const upstream = (status: number, body: unknown = {}) => ({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
});

const check = (url: string, extra = "") =>
    new Request(
        `https://www.saroh.in/api/link-preview?url=${encodeURIComponent(url)}${extra}`,
        { headers: { "x-real-ip": "203.0.113.9" } },
    );

describe("GET /api/link-preview", () => {
    it("asks the API with the visitor's address signed, and passes the check through", async () => {
        const answer = {
            ok: true,
            url: "https://shop.in/",
            score: "Looks right on all 6 apps. Nothing to fix.",
        };
        fetchMock.mockResolvedValue(upstream(200, answer));
        const res = await GET(check("https://shop.in", "&fresh=1"));
        expect(await res.json()).toEqual(answer);
        const [called, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(called).toBe(
            "https://api.example.test/public/tools/link-preview?url=https%3A%2F%2Fshop.in&fresh=1",
        );
        expect(
            (init.headers as Record<string, string>)["x-saroh-relay"],
        ).toMatch(/^v1\./);
    });

    it.each([
        [429, "rate-limited"],
        [500, "unavailable"],
        [400, "invalid"],
    ])("answers the API's %s as %s", async (status, failure) => {
        fetchMock.mockResolvedValue(upstream(status));
        const res = await GET(check("shop.in"));
        expect(await res.json()).toMatchObject({ ok: false, failure });
    });

    it("answers unavailable when the API can't be reached or isn't configured", async () => {
        fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
        expect(await (await GET(check("shop.in"))).json()).toMatchObject({
            failure: "unavailable",
        });
        env.API_URL = undefined;
        expect(await (await GET(check("shop.in"))).json()).toMatchObject({
            failure: "unavailable",
        });
    });
});

describe("POST /api/link-preview", () => {
    const unlock = (body: unknown) =>
        new Request("https://www.saroh.in/api/link-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

    it("sends only the email, the address and a real boolean consent", async () => {
        fetchMock.mockResolvedValue(
            upstream(200, {
                unlocked: true,
                emailed: "sent",
                fixes: [],
                suggestedTags: "",
            }),
        );
        await POST(
            unlock({
                email: " a@shop.in ",
                url: "https://shop.in/",
                consent: "yes",
                extra: 1,
            }),
        );
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(JSON.parse(init.body as string)).toEqual({
            email: "a@shop.in",
            url: "https://shop.in/",
            consent: false,
        });
    });

    it("answers a refused email as bad-email, and no email without asking", async () => {
        fetchMock.mockResolvedValue(upstream(400));
        expect(
            await (
                await POST(
                    unlock({ email: "x", url: "shop.in", consent: true }),
                )
            ).json(),
        ).toEqual({
            unlocked: false,
            failure: "bad-email",
        });
        const missing = await POST(unlock({ url: "shop.in" }));
        expect(await missing.json()).toEqual({
            unlocked: false,
            failure: "bad-email",
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
