const mockEnv: Record<string, string | undefined> = {
    NODE_ENV: "test",
};
jest.mock("../../env", () => ({
    env: mockEnv,
    declaredNodeEnv: "test",
}));
jest.mock("@saroh/database", () => ({ prisma: {} }));

import type { Job } from "@saroh/database";

import {
    enqueuePageRevalidation,
    noteProductsChanging,
    noteShelvesChanging,
    SITE_PAGES_REVALIDATE_TYPE,
} from "./page-cache-revalidate";
import type { PageTagReads } from "./page-cache.job";
import {
    PAGE_CACHE_REVALIDATE_PATH,
    PageCacheRevalidateHandler,
    readPayload,
    tagsFor,
} from "./page-cache.job";

const SECRET = "a-page-cache-secret-that-is-long-enough-00";

function reads(over: Partial<PageTagReads> = {}): PageTagReads {
    return {
        shelvesProducts: async () => [],
        productsBusinesses: async (ids) =>
            ids.map((id) => ({ id, organizationId: "org_1" })),
        liveSites: async (orgs) =>
            orgs.includes("org_1")
                ? [{ id: "site_1", organizationId: "org_1" }]
                : [],
        ...over,
    };
}

const job = (payload: unknown) => ({ id: "job_1", payload }) as unknown as Job;

describe("what a revalidation names (#863)", () => {
    it("names a whole site after a publish", async () => {
        expect(
            await tagsFor({ cause: "publish", siteIds: ["site_1"] }, reads()),
        ).toEqual(["site:site_1"]);
    });

    it("names a product's page and its business's product lists", async () => {
        expect(
            await tagsFor(
                { cause: "product", productIds: ["prod_1"] },
                reads(),
            ),
        ).toEqual(["site:site_1:products", "site:site_1:product:prod_1"]);
    });

    it("finds the products a shelf change is about", async () => {
        const tags = await tagsFor(
            { cause: "stock", stockLevelIds: ["sl_1", "sl_2"] },
            reads({ shelvesProducts: async () => ["prod_1", "prod_2"] }),
        );
        expect(tags.sort()).toEqual([
            "site:site_1:product:prod_1",
            "site:site_1:product:prod_2",
            "site:site_1:products",
        ]);
    });

    it("names only the sites of the product's own business", async () => {
        const tags = await tagsFor(
            { cause: "stock", productIds: ["prod_1", "prod_9"] },
            reads({
                productsBusinesses: async () => [
                    { id: "prod_1", organizationId: "org_1" },
                    { id: "prod_9", organizationId: "org_9" },
                ],
                liveSites: async () => [
                    { id: "site_1", organizationId: "org_1" },
                    { id: "site_9", organizationId: "org_9" },
                ],
            }),
        );
        expect(tags).toContain("site:site_1:product:prod_1");
        expect(tags).toContain("site:site_9:product:prod_9");
        expect(tags).not.toContain("site:site_1:product:prod_9");
        expect(tags).not.toContain("site:site_9:product:prod_1");
    });

    it("finds a deleted product's business in the payload", async () => {
        const tags = await tagsFor(
            {
                cause: "product",
                productIds: ["prod_gone"],
                organizationId: "org_1",
            },
            reads({ productsBusinesses: async () => [] }),
        );
        expect(tags).toEqual([
            "site:site_1:products",
            "site:site_1:product:prod_gone",
        ]);
    });

    it("names nothing for a business with no live site", async () => {
        expect(
            await tagsFor(
                { cause: "stock", productIds: ["prod_1"] },
                reads({ liveSites: async () => [] }),
            ),
        ).toEqual([]);
    });

    it("drops ids the renderer couldn't take as a tag", () => {
        expect(
            readPayload({
                cause: "publish",
                siteIds: ["site_1", "a:b", "", 4],
            }).siteIds,
        ).toEqual(["site_1"]);
    });
});

describe("site.pages.revalidate (#863)", () => {
    afterEach(() => {
        mockEnv.SITE_PAGE_CACHE = undefined;
        mockEnv.SITE_RELAY_SECRET = undefined;
        mockEnv.RENDERER_URL = undefined;
    });

    function handler(fetchFn: jest.Mock) {
        const h = new PageCacheRevalidateHandler();
        h.fetchFn = fetchFn as unknown as typeof fetch;
        h.reads = reads();
        return h;
    }

    it("POSTs the tags to the renderer, signed", async () => {
        mockEnv.SITE_PAGE_CACHE = "on";
        mockEnv.SITE_RELAY_SECRET = SECRET;
        mockEnv.RENDERER_URL = "https://saroh.dev";
        const fetchFn = jest
            .fn()
            .mockResolvedValue(new Response(null, { status: 204 }));
        await handler(fetchFn).handle(
            job({ cause: "publish", siteIds: ["site_1"] }),
        );
        expect(fetchFn).toHaveBeenCalledTimes(1);
        const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`https://saroh.dev${PAGE_CACHE_REVALIDATE_PATH}`);
        expect(init.method).toBe("POST");
        expect(init.body).toBe('{"tags":["site:site_1"]}');
        const headers = init.headers as Record<string, string>;
        expect(headers["x-saroh-page-cache"]).toMatch(/^v1\.\d+\./);
    });

    it("throws on anything but a 2xx, so the queue retries", async () => {
        mockEnv.SITE_PAGE_CACHE = "on";
        mockEnv.SITE_RELAY_SECRET = SECRET;
        const refused = jest
            .fn()
            .mockResolvedValue(new Response("no", { status: 401 }));
        await expect(
            handler(refused).handle(job({ cause: "publish", siteIds: ["s"] })),
        ).rejects.toThrow("401");
        const down = jest.fn().mockRejectedValue(new TypeError("fetch failed"));
        await expect(
            handler(down).handle(job({ cause: "publish", siteIds: ["s"] })),
        ).rejects.toThrow("unreachable");
    });

    it("sends nothing when the cache was switched off since", async () => {
        const fetchFn = jest.fn();
        await handler(fetchFn).handle(
            job({ cause: "publish", siteIds: ["site_1"] }),
        );
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("splits a long list into calls the Worker accepts", async () => {
        mockEnv.SITE_PAGE_CACHE = "on";
        mockEnv.SITE_RELAY_SECRET = SECRET;
        const fetchFn = jest
            .fn()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const siteIds = Array.from({ length: 900 }, (_, i) => `site_${i}`);
        await handler(fetchFn).handle(job({ cause: "publish", siteIds }));
        expect(fetchFn).toHaveBeenCalledTimes(3);
    });
});

describe("queueing a revalidation (#863)", () => {
    afterEach(() => {
        mockEnv.SITE_PAGE_CACHE = undefined;
    });

    const tx = () => ({ job: { create: jest.fn().mockResolvedValue({}) } });

    it("queues nothing while the cache is off", async () => {
        const t = tx();
        expect(
            await enqueuePageRevalidation(t as never, {
                cause: "publish",
                siteIds: ["site_1"],
            }),
        ).toBe(false);
        await noteShelvesChanging(t as never, ["sl_1"]);
        await noteProductsChanging(t as never, ["prod_1"]);
        expect(t.job.create).not.toHaveBeenCalled();
    });

    it("queues on the caller's transaction when on", async () => {
        mockEnv.SITE_PAGE_CACHE = "on";
        const t = tx();
        await enqueuePageRevalidation(t as never, {
            cause: "publish",
            siteIds: ["site_1"],
        });
        expect(t.job.create).toHaveBeenCalledWith({
            data: {
                type: SITE_PAGES_REVALIDATE_TYPE,
                payload: { cause: "publish", siteIds: ["site_1"] },
            },
        });
    });

    it("queues nothing that names nothing", async () => {
        mockEnv.SITE_PAGE_CACHE = "on";
        const t = tx();
        expect(
            await enqueuePageRevalidation(t as never, {
                cause: "publish",
                siteIds: [],
            }),
        ).toBe(false);
        expect(t.job.create).not.toHaveBeenCalled();
    });

    it("queues a shelf or product once per transaction", async () => {
        mockEnv.SITE_PAGE_CACHE = "on";
        const t = tx();
        await noteShelvesChanging(t as never, ["sl_1", "sl_2"]);
        await noteShelvesChanging(t as never, ["sl_2"]);
        await noteShelvesChanging(t as never, ["sl_2", "sl_3"]);
        await noteProductsChanging(t as never, ["prod_1"]);
        await noteProductsChanging(t as never, ["prod_1"]);
        const payloads = t.job.create.mock.calls.map(
            (c) => (c[0] as { data: { payload: unknown } }).data.payload,
        );
        expect(payloads).toEqual([
            { cause: "stock", stockLevelIds: ["sl_1", "sl_2"] },
            { cause: "stock", stockLevelIds: ["sl_3"] },
            { cause: "stock", productIds: ["prod_1"] },
        ]);
        // Another transaction hears it again.
        const other = tx();
        await noteShelvesChanging(other as never, ["sl_1"]);
        expect(other.job.create).toHaveBeenCalledTimes(1);
    });
});
