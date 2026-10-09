import { describe, expect, it } from "vitest";

import { dontCachePage, keepPageAtMost, tagPage } from "./record";
import { signPageRevalidation } from "./signature";
import { LIVE_HEAD_MAX_AGE_SECONDS, pageCacheRules } from "./site-rules";
import { fakeCache, fakeNamespace } from "./testing";
import type { PageCacheEnv, WaitUntil } from "./worker";
import {
    CACHE_STATUS_HEADER,
    pageCacheConfig,
    REVALIDATE_PATH,
    withPageCache,
} from "./worker";

const SECRET = "a-page-cache-secret-that-is-long-enough-00";

interface Harness {
    env: PageCacheEnv;
    cache: ReturnType<typeof fakeCache>;
    namespace: ReturnType<typeof fakeNamespace>;
    clock: { now: number };
    renders: number;
    logs: string[];
    /** What the next render does inside its request. */
    render: (request: Request) => Response;
    fetch: (
        url: string,
        init?: RequestInit & { host?: string },
    ) => Promise<Response>;
}

function page(
    body = "<html>page</html>",
    headers: Record<string, string> = {},
) {
    return new Response(body, {
        status: 200,
        headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control":
                "private, no-cache, no-store, max-age=0, must-revalidate",
            ...headers,
        },
    });
}

function harness(envOverride: Partial<PageCacheEnv> = {}): Harness {
    const cache = fakeCache();
    const namespace = fakeNamespace();
    // The tag store stamps revalidations with the real clock, so the
    // render's starts from it too and moves on from there.
    const clock = { now: Date.now() };
    const h: Harness = {
        env: {
            SITE_PAGE_CACHE: "on",
            SITE_PAGE_TAGS: namespace,
            SITE_RELAY_SECRET: SECRET,
            NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app",
            CF_VERSION_METADATA: { id: "version-1" },
            ...envOverride,
        },
        cache,
        namespace,
        clock,
        renders: 0,
        logs: [],
        render: () => {
            tagPage("site:site_1");
            return page();
        },
        fetch: () => Promise.resolve(new Response(null)),
    };
    const handler = withPageCache<PageCacheEnv, WaitUntil>(
        async (request) => {
            h.renders += 1;
            // As OpenNext does: the render is async work inside the request.
            await Promise.resolve();
            return h.render(request);
        },
        {
            openCache: () => Promise.resolve(cache),
            now: () => clock.now,
            log: (event) => h.logs.push(event),
        },
    );
    h.fetch = async (url, init = {}) => {
        const waits: Promise<unknown>[] = [];
        const headers = new Headers(init.headers);
        headers.set("host", init.host ?? new URL(url).host);
        const res = await handler(
            new Request(url, { ...init, headers }),
            h.env,
            { waitUntil: (p) => waits.push(p) },
        );
        // The visitor reads the page; then what was put off finishes.
        const text = await res.clone().text();
        await Promise.all(waits);
        return new Response(res.status === 204 ? null : text, res);
    };
    return h;
}

async function revalidate(h: Harness, tags: string[], at = h.clock.now) {
    const body = JSON.stringify({ tags });
    return h.fetch(`https://saroh.app${REVALIDATE_PATH}`, {
        method: "POST",
        body,
        headers: {
            "x-saroh-page-cache": await signPageRevalidation(body, SECRET, at),
        },
    });
}

describe("the merchant sites' page cache (#863)", () => {
    it("renders once, then answers the next visitor from the cache", async () => {
        const h = harness();
        const first = await h.fetch("https://rye.saroh.app/about");
        expect(first.headers.get(CACHE_STATUS_HEADER)).toBe("miss");
        expect(await first.text()).toBe("<html>page</html>");

        h.clock.now += 1000;
        const second = await h.fetch("https://rye.saroh.app/about");
        expect(second.headers.get(CACHE_STATUS_HEADER)).toBe("hit");
        expect(await second.text()).toBe("<html>page</html>");
        expect(h.renders).toBe(1);
        // The visitor's copy says what Next said: never stored by a browser.
        expect(second.headers.get("cache-control")).toContain("no-store");
        expect(second.headers.get("x-saroh-page-tags")).toBeNull();
    });

    it("never answers one host with another's page", async () => {
        const h = harness();
        await h.fetch("https://rye.saroh.app/about");
        const other = await h.fetch("https://pulse.saroh.app/about");
        expect(other.headers.get(CACHE_STATUS_HEADER)).toBe("miss");
        expect(h.renders).toBe(2);
    });

    it("draws again once a tag the page carries is revalidated", async () => {
        const h = harness();
        h.render = () => {
            tagPage("site:site_1", "site:site_1:product:prod_1");
            return page();
        };
        await h.fetch("https://rye.saroh.app/shop/bread");
        h.clock.now += 5000;

        // Another product: still served.
        expect(
            (await revalidate(h, ["site:site_1:product:prod_2"])).status,
        ).toBe(204);
        h.clock.now += 5000;
        expect(
            (await h.fetch("https://rye.saroh.app/shop/bread")).headers.get(
                CACHE_STATUS_HEADER,
            ),
        ).toBe("hit");

        // This product: drawn again.
        await revalidate(h, ["site:site_1:product:prod_1"]);
        h.clock.now += 5000;
        expect(
            (await h.fetch("https://rye.saroh.app/shop/bread")).headers.get(
                CACHE_STATUS_HEADER,
            ),
        ).toBe("miss");
        expect(h.renders).toBe(2);
    });

    it("draws every page of a site again after a publish", async () => {
        const h = harness();
        await h.fetch("https://rye.saroh.app/");
        await h.fetch("https://rye.saroh.app/about");
        h.clock.now += 5000;
        await revalidate(h, ["site:site_1"]);
        h.clock.now += 5000;
        await h.fetch("https://rye.saroh.app/");
        await h.fetch("https://rye.saroh.app/about");
        expect(h.renders).toBe(4);
    });

    it("counts a revalidation that arrives while the page was rendering", async () => {
        const h = harness();
        h.render = () => {
            tagPage("site:site_1");
            return page();
        };
        // The render starts at t; the write commits and is told at t + 1s,
        // before the page finished: that page may hold the old data.
        const started = h.clock.now;
        await h.fetch("https://rye.saroh.app/about");
        h.clock.now = started + 1000;
        await revalidate(h, ["site:site_1"]);
        h.clock.now = started + 2000;
        const next = await h.fetch("https://rye.saroh.app/about");
        expect(next.headers.get(CACHE_STATUS_HEADER)).toBe("miss");
    });

    it("serves a page drawn after a revalidation", async () => {
        const h = harness();
        await revalidate(h, ["site:site_1"]);
        h.clock.now += 10_000;
        await h.fetch("https://rye.saroh.app/about");
        h.clock.now += 1000;
        expect(
            (await h.fetch("https://rye.saroh.app/about")).headers.get(
                CACHE_STATUS_HEADER,
            ),
        ).toBe("hit");
    });

    it("keeps a page no longer than its time", async () => {
        const h = harness({ SITE_PAGE_CACHE_TTL: "300" });
        await h.fetch("https://rye.saroh.app/about");
        h.clock.now += 299_000;
        expect(
            (await h.fetch("https://rye.saroh.app/about")).headers.get(
                CACHE_STATUS_HEADER,
            ),
        ).toBe("hit");
        h.clock.now += 2000;
        expect(
            (await h.fetch("https://rye.saroh.app/about")).headers.get(
                CACHE_STATUS_HEADER,
            ),
        ).toBe("miss");
    });

    it("keeps a page with the merchant's trackers a minute at most (DEC-108)", async () => {
        const h = harness();
        h.render = () => {
            pageCacheRules({
                siteId: "site_1",
                test: false,
                liveHead: true,
                catalogueFailed: false,
            });
            return page();
        };
        await h.fetch("https://rye.saroh.app/");
        h.clock.now += (LIVE_HEAD_MAX_AGE_SECONDS - 1) * 1000;
        expect(
            (await h.fetch("https://rye.saroh.app/")).headers.get(
                CACHE_STATUS_HEADER,
            ),
        ).toBe("hit");
        h.clock.now += 2000;
        expect(
            (await h.fetch("https://rye.saroh.app/")).headers.get(
                CACHE_STATUS_HEADER,
            ),
        ).toBe("miss");
    });

    it("never keeps a page the render didn't tag, or refused", async () => {
        for (const render of [
            () => page(),
            () => {
                tagPage("site:site_1");
                dontCachePage("signed in");
                return page();
            },
            () => {
                pageCacheRules({
                    siteId: "site_1",
                    test: true,
                    liveHead: false,
                    catalogueFailed: false,
                });
                return page();
            },
            () => {
                pageCacheRules({
                    siteId: "site_1",
                    test: false,
                    liveHead: false,
                    catalogueFailed: true,
                });
                return page();
            },
            () => {
                tagPage("site:site_1");
                keepPageAtMost(0);
                return page();
            },
        ]) {
            const h = harness();
            h.render = render;
            await h.fetch("https://rye.saroh.app/");
            await h.fetch("https://rye.saroh.app/");
            expect(h.renders).toBe(2);
            expect(h.cache.entries.size).toBe(0);
        }
    });

    it("never keeps a response that sets a cookie, fails or isn't a page", async () => {
        for (const response of [
            page("<html/>", { "set-cookie": "a=1" }),
            new Response("nope", {
                status: 500,
                headers: { "content-type": "text/html" },
            }),
            new Response("{}", {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        ]) {
            const h = harness();
            h.render = () => {
                tagPage("site:site_1");
                return response.clone();
            };
            await h.fetch("https://rye.saroh.app/");
            await h.fetch("https://rye.saroh.app/");
            expect(h.renders).toBe(2);
        }
    });

    it("passes private paths, signed-in visitors and test hosts straight through", async () => {
        const h = harness();
        for (const [url, cookie] of [
            ["https://rye.saroh.app/account", ""],
            ["https://rye.saroh.app/checkout/o1", ""],
            ["https://saroh.app/preview/tok", ""],
            ["https://saroh.app/review/tok", ""],
            ["https://test--rye.saroh.app/", ""],
            ["https://rye.saroh.app/", "__Host-saroh_session=tok"],
        ] as const) {
            const res = await h.fetch(url, {
                headers: cookie ? { cookie } : {},
            });
            expect(res.headers.get(CACHE_STATUS_HEADER)).toBeNull();
        }
        expect(h.cache.entries.size).toBe(0);
    });

    it("is off without its switch, its store, its secret or a version", async () => {
        for (const env of [
            { SITE_PAGE_CACHE: "off" },
            { SITE_PAGE_CACHE: undefined },
            { SITE_PAGE_TAGS: undefined },
            { SITE_RELAY_SECRET: undefined },
            { CF_VERSION_METADATA: undefined },
        ]) {
            const h = harness(env);
            expect(pageCacheConfig(h.env)).toBeNull();
            await h.fetch("https://rye.saroh.app/");
            await h.fetch("https://rye.saroh.app/");
            expect(h.renders).toBe(2);
        }
    });

    it("renders as before when the cache or the tag store fails", async () => {
        const h = harness();
        await h.fetch("https://rye.saroh.app/");
        h.env.SITE_PAGE_TAGS = {
            idFromName: () => "x",
            get: () => ({
                fetch: () => Promise.reject(new Error("down")),
            }),
        };
        const res = await h.fetch("https://rye.saroh.app/");
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("<html>page</html>");
        expect(h.renders).toBe(2);
        expect(h.logs).toContain("page_cache_unavailable");
    });

    it("serves nothing kept by an older deploy", async () => {
        const h = harness();
        await h.fetch("https://rye.saroh.app/");
        h.env.CF_VERSION_METADATA = { id: "version-2" };
        expect(
            (await h.fetch("https://rye.saroh.app/")).headers.get(
                CACHE_STATUS_HEADER,
            ),
        ).toBe("miss");
    });
});

describe("the revalidation the API sends (#863)", () => {
    it("refuses one that isn't signed with the shared secret", async () => {
        const h = harness();
        const body = JSON.stringify({ tags: ["site:site_1"] });
        const unsigned = await h.fetch(`https://saroh.app${REVALIDATE_PATH}`, {
            method: "POST",
            body,
        });
        expect(unsigned.status).toBe(401);
        const forged = await h.fetch(`https://saroh.app${REVALIDATE_PATH}`, {
            method: "POST",
            body,
            headers: {
                "x-saroh-page-cache": await signPageRevalidation(
                    body,
                    "someone-else-secret-that-is-long-enough",
                    h.clock.now,
                ),
            },
        });
        expect(forged.status).toBe(401);
        expect(h.namespace.objects.size).toBe(0);
    });

    it("refuses tags that aren't a site's", async () => {
        const h = harness();
        expect((await revalidate(h, ["product:p1"])).status).toBe(400);
    });

    it("is recorded even while the cache is switched off", async () => {
        const h = harness({ SITE_PAGE_CACHE: "off" });
        expect((await revalidate(h, ["site:site_1"])).status).toBe(204);
        expect(h.namespace.objects.has("site_1")).toBe(true);
    });

    it("never reaches the site's pages", async () => {
        const h = harness();
        await revalidate(h, ["site:site_1"]);
        expect(h.renders).toBe(0);
    });
});
