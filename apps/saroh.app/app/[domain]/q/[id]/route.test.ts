import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dynamic, GET, HEAD } from "./route";

const state = vi.hoisted((): { site: unknown } => ({ site: null }));

vi.mock("@/lib/publication", () => ({
    getSiteForHost: vi.fn(() => Promise.resolve(state.site)),
}));
vi.mock("@/lib/api-url", () => ({
    serverApiUrl: () => "https://api.example.test",
}));
vi.mock("@/lib/relay-headers", () => ({
    withRelayFrom: (_headers: Headers, base: Record<string, string>) => ({
        ...base,
        "x-saroh-relay": "v1.signed",
    }),
}));

const LIVE = { mode: "live", siteId: "site_1", snapshot: {}, modules: null };
const PHONE = "Mozilla/5.0 (iPhone)";

const send = vi.fn<typeof fetch>();

function answers(body: unknown, status = 200): void {
    send.mockImplementation(() =>
        Promise.resolve(
            new Response(JSON.stringify(body), {
                status,
                headers: { "content-type": "application/json" },
            }),
        ),
    );
}

function scan(
    id: string,
    over: { host?: string; method?: "GET" | "HEAD"; proto?: string } = {},
): Promise<Response> {
    const host = over.host ?? "rye.saroh.app";
    const method = over.method ?? "GET";
    const request = new Request(`http://internal/${host}/q/${id}`, {
        method,
        headers: {
            host,
            "user-agent": PHONE,
            ...(over.proto ? { "x-forwarded-proto": over.proto } : {}),
        },
    });
    const context = { params: Promise.resolve({ domain: host, id }) };
    return method === "HEAD" ? HEAD(request, context) : GET(request, context);
}

/** What the API was sent for the nth scan. */
function sent(call = 0): { url: string; body: Record<string, unknown> } {
    const [url, init] = send.mock.calls[call] ?? [];
    return {
        url: typeof url === "string" ? url : "",
        body:
            typeof init?.body === "string"
                ? (JSON.parse(init.body) as Record<string, unknown>)
                : {},
    };
}

beforeEach(() => {
    state.site = LIVE;
    send.mockReset();
    answers({ kind: "path", path: "/book", counted: true });
    vi.stubGlobal("fetch", send);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("GET /q/<code> on a merchant's address", () => {
    it("is never prerendered", () => {
        expect(dynamic).toBe("force-dynamic");
    });

    it("forwards to the target with the tag, on an absolute address, never kept", async () => {
        const res = await scan("h7c");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(
            "https://rye.saroh.app/book?src=qr-h7c",
        );
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(sent()).toEqual({
            url: "https://api.example.test/public/sites/site_1/qr/h7c/scan",
            body: { userAgent: PHONE },
        });
        expect(send.mock.calls[0]?.[1]?.headers).toMatchObject({
            "x-saroh-relay": "v1.signed",
        });
    });

    it("asks the API on every scan: two scans, two counts", async () => {
        await scan("h7c");
        await scan("h7c");
        expect(send).toHaveBeenCalledTimes(2);
    });

    it("answers on the address asked: a custom domain, or http behind a local proxy", async () => {
        expect(
            (await scan("h7c", { host: "www.ryebakery.in" })).headers.get(
                "location",
            ),
        ).toBe("https://www.ryebakery.in/book?src=qr-h7c");
        expect(
            (
                await scan("h7c", {
                    host: "rye.saroh.app.localhost",
                    proto: "http",
                })
            ).headers.get("location"),
        ).toBe("http://rye.saroh.app.localhost/book?src=qr-h7c");
    });

    it("reads a code in any case as the same code", async () => {
        const res = await scan("H7C");
        expect(sent().url).toContain("/qr/h7c/scan");
        expect(res.headers.get("location")).toContain("src=qr-h7c");
    });

    it("sends a retired code home with no tag", async () => {
        answers({ kind: "home", counted: false });
        const res = await scan("h7c");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("https://rye.saroh.app/");
    });

    it("is the site's 404 for a code it doesn't have", async () => {
        answers({ error: { code: "NOT_FOUND" } }, 404);
        const res = await scan("zzz");
        expect(res.status).toBe(404);
        expect(res.headers.get("location")).toBeNull();
        expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("never shows an error: an API that fails or is down forwards home", async () => {
        for (const status of [401, 409, 429, 500, 503]) {
            answers({ error: {} }, status);
            const res = await scan("h7c");
            expect(res.status).toBe(302);
            expect(res.headers.get("location")).toBe("https://rye.saroh.app/");
        }
        send.mockImplementation(() => Promise.reject(new Error("down")));
        const res = await scan("h7c");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("https://rye.saroh.app/");
    });

    it("is a 404 without asking the API for a malformed code", async () => {
        for (const id of ["h7", "toolong1", "h-7", "h7c.png"]) {
            expect((await scan(id)).status).toBe(404);
        }
        expect(send).not.toHaveBeenCalled();
    });

    it("is a 404 on a host with no live site, and on a test release's host", async () => {
        state.site = null;
        expect((await scan("h7c")).status).toBe(404);
        state.site = { ...LIVE, mode: "test" };
        expect(
            (await scan("h7c", { host: "test--rye.saroh.app" })).status,
        ).toBe(404);
        state.site = { ...LIVE, siteId: null };
        expect((await scan("h7c")).status).toBe(404);
        // Nothing was asked, so nothing was counted.
        expect(send).not.toHaveBeenCalled();
    });
});

describe("HEAD /q/<code>", () => {
    it("answers the same redirect and tells the API not to count it", async () => {
        const res = await scan("h7c", { method: "HEAD" });
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(
            "https://rye.saroh.app/book?src=qr-h7c",
        );
        expect(sent().body).toEqual({ userAgent: PHONE, head: true });
    });
});
