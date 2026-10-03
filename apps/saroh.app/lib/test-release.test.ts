import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The renderer's side of a test release (DEC-071, T5): how it reads one, and
 * that a live host never asks for one while a test host never asks for the
 * live site (R12).
 */

let requestHeaders = new Headers();

vi.mock("@/env", () => ({
    env: {
        API_URL: "https://api.test",
        NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app",
        NODE_ENV: "test",
    },
}));
vi.mock("next/headers", () => ({
    headers: () => Promise.resolve(requestHeaders),
}));
// `cache` shares a read within one request; each test here is its own.
vi.mock("react", async (original) => ({
    ...(await original<object>()),
    cache: <T>(fn: T) => fn,
}));

import { getSiteForHost } from "./publication";
import { TEST_RELEASE_HEADER } from "./test-host";
import {
    fetchTestRelease,
    getTestRelease,
    TEST_TOKEN_HEADER,
    testMode,
} from "./test-release";

const TOKEN = "abcdefghijklmnopqrstuvwxyz012345";

const SNAPSHOT = {
    site: { name: "Northwind", slug: "northwind" },
    pages: [{ path: "/", title: "Home", isHome: true, sections: [] }],
    publishedAt: "2026-09-30T10:00:00.000Z",
};

const RELEASE_BODY = {
    snapshot: SNAPSHOT,
    publishedAt: "2026-09-30T10:00:00.000Z",
    siteId: "site_nw",
    modules: { SHOP: "off" },
    release: {
        name: "Diwali menu",
        number: 3,
        madeAt: "2026-09-30T10:00:00.000Z",
    },
    liveUrl: "https://northwind.saroh.app",
};

interface Call {
    url: string;
    headers: Record<string, string>;
}
let calls: Call[] = [];

function answer(status: number, body: unknown) {
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string, init?: { headers?: Record<string, string> }) => {
            calls.push({ url, headers: init?.headers ?? {} });
            return Promise.resolve(
                new Response(JSON.stringify(body), {
                    status,
                    headers: { "content-type": "application/json" },
                }),
            );
        }),
    );
}

beforeEach(() => {
    calls = [];
    requestHeaders = new Headers();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchTestRelease", () => {
    it("sends the host in the query and the token in a header, never the path", async () => {
        answer(200, RELEASE_BODY);
        const found = await fetchTestRelease(
            "test--northwind.saroh.app",
            TOKEN,
            "v1.relay",
        );
        expect(found.ok).toBe(true);
        expect(calls).toHaveLength(1);
        const [call] = calls;
        expect(call.url).toBe(
            "https://api.test/public/sites/test-release?host=test--northwind.saroh.app",
        );
        expect(call.url).not.toContain(TOKEN);
        expect(call.headers[TEST_TOKEN_HEADER]).toBe(TOKEN);
        expect(call.headers["x-saroh-relay"]).toBe("v1.relay");
    });

    it("returns the frozen snapshot, the real site's id, live module states and the release", async () => {
        answer(200, RELEASE_BODY);
        const found = await fetchTestRelease(
            "test--northwind.saroh.app",
            TOKEN,
            null,
        );
        expect(found).toEqual({
            ok: true,
            snapshot: SNAPSHOT,
            siteId: "site_nw",
            modules: { SHOP: "off" },
            release: RELEASE_BODY.release,
            liveUrl: "https://northwind.saroh.app/",
        });
    });

    it.each(["expired", "revoked", "discarded"] as const)(
        "names a link that stopped working: %s",
        async (reason) => {
            answer(410, { error: { details: { reason } } });
            expect(
                await fetchTestRelease(
                    "test--northwind.saroh.app",
                    TOKEN,
                    null,
                ),
            ).toEqual({ ok: false, reason, liveUrl: null });
        },
    );

    it("points a release that went live at the live site", async () => {
        answer(410, {
            error: {
                details: {
                    reason: "live",
                    liveUrl: "https://northwind.saroh.app",
                },
            },
        });
        expect(
            await fetchTestRelease("test--northwind.saroh.app", TOKEN, null),
        ).toEqual({
            ok: false,
            reason: "live",
            liveUrl: "https://northwind.saroh.app/",
        });
    });

    it("never links anywhere but http(s)", async () => {
        answer(410, {
            error: {
                details: { reason: "live", liveUrl: "javascript:alert(1)" },
            },
        });
        const found = await fetchTestRelease("test--x.saroh.app", TOKEN, null);
        expect(found.ok === false && found.liveUrl).toBeNull();
    });

    it("keeps 'no such link' apart from 'could not ask'", async () => {
        answer(404, { error: {} });
        expect(
            await fetchTestRelease("test--x.saroh.app", TOKEN, null),
        ).toMatchObject({ ok: false, reason: "missing" });

        answer(503, {});
        expect(
            await fetchTestRelease("test--x.saroh.app", TOKEN, null),
        ).toMatchObject({ ok: false, reason: "unavailable" });

        answer(429, {});
        expect(
            await fetchTestRelease("test--x.saroh.app", TOKEN, null),
        ).toMatchObject({ ok: false, reason: "unavailable" });

        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.reject(new Error("down"))),
        );
        expect(
            await fetchTestRelease("test--x.saroh.app", TOKEN, null),
        ).toMatchObject({ ok: false, reason: "unavailable" });
    });

    it("refuses a body that is not a release", async () => {
        answer(200, { snapshot: SNAPSHOT });
        expect(
            await fetchTestRelease("test--x.saroh.app", TOKEN, null),
        ).toMatchObject({ ok: false, reason: "unavailable" });
    });
});

describe("getTestRelease", () => {
    it("asks nothing without the token the middleware passes on", async () => {
        answer(200, RELEASE_BODY);
        expect(await getTestRelease("test--northwind.saroh.app")).toEqual({
            ok: false,
            reason: "missing",
            liveUrl: null,
        });
        expect(calls).toHaveLength(0);
    });

    it("reads with the token and the visitor's relay", async () => {
        requestHeaders = new Headers({
            host: "test--northwind.saroh.app",
            [TEST_RELEASE_HEADER]: TOKEN,
            "x-real-ip": "203.0.113.9",
        });
        answer(200, RELEASE_BODY);
        expect((await getTestRelease("test--northwind.saroh.app")).ok).toBe(
            true,
        );
        expect(calls[0]?.headers[TEST_TOKEN_HEADER]).toBe(TOKEN);
        expect(calls[0]?.headers["x-saroh-relay"]).toMatch(/^v1\./);
    });
});

describe("getSiteForHost (R12)", () => {
    it("a live host never asks for a test release", async () => {
        requestHeaders = new Headers({ [TEST_RELEASE_HEADER]: TOKEN });
        answer(200, { snapshot: SNAPSHOT, siteId: "site_nw" });
        const site = await getSiteForHost("northwind.saroh.app");
        expect(site?.mode).toBe("live");
        expect(site?.release).toBeNull();
        expect(calls.map((c) => c.url)).toEqual([
            "https://api.test/public/sites/by-subdomain/northwind",
        ]);
    });

    it("a test host shows its release and never asks for the live site", async () => {
        requestHeaders = new Headers({ [TEST_RELEASE_HEADER]: TOKEN });
        answer(200, RELEASE_BODY);
        const site = await getSiteForHost("test--northwind.saroh.app");
        expect(site).toMatchObject({
            mode: "test",
            siteId: "site_nw",
            release: { name: "Diwali menu", number: 3 },
            snapshot: SNAPSHOT,
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.url).toContain("/public/sites/test-release?host=");
    });

    it("a test host whose link opens nothing shows nothing, not the live site", async () => {
        requestHeaders = new Headers({ [TEST_RELEASE_HEADER]: TOKEN });
        answer(404, {});
        expect(await getSiteForHost("test--northwind.saroh.app")).toBeNull();
        expect(calls.every((c) => !c.url.includes("by-subdomain"))).toBe(true);

        calls = [];
        requestHeaders = new Headers();
        expect(await getSiteForHost("test--northwind.saroh.app")).toBeNull();
        expect(calls).toHaveLength(0);
    });
});

describe("testMode (KTD-8)", () => {
    it("is on for a test-shaped host, even with no token", async () => {
        requestHeaders = new Headers({ host: "test--northwind.saroh.app" });
        expect(await testMode()).toBe(true);
        requestHeaders = new Headers({ host: "test.shop.acme.com" });
        expect(await testMode()).toBe(true);
    });

    it("is on for a request the middleware marked", async () => {
        requestHeaders = new Headers({
            host: "northwind.saroh.app",
            [TEST_RELEASE_HEADER]: TOKEN,
        });
        expect(await testMode()).toBe(true);
    });

    it("is off on a live host", async () => {
        requestHeaders = new Headers({ host: "northwind.saroh.app" });
        expect(await testMode()).toBe(false);
        requestHeaders = new Headers({ host: "shop.acme.com" });
        expect(await testMode()).toBe(false);
    });
});
