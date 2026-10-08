import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readLivePricing, readPreviewPricing } from "./pricing";
import { fakeCatalogInput } from "./pricing.fixture";

const env = vi.hoisted(() => {
    const e: {
        API_URL?: string;
        NODE_ENV?: string;
        NEXT_PHASE?: string;
        VERCEL_ENV?: string;
    } = {
        API_URL: "https://api.test",
        NODE_ENV: "test",
    };
    return e;
});
vi.mock("@/env", () => ({ env }));

type FetchInit = RequestInit;

/** A fetch that answers `body` with `status`, recording its calls. */
function answering(body: unknown, status = 200) {
    return vi.fn((_url: string, _init?: FetchInit) =>
        Promise.resolve(
            new Response(JSON.stringify(body), {
                status,
                headers: { "content-type": "application/json" },
            }),
        ),
    );
}

const asFetch = (f: unknown) => f as typeof fetch;

const live = {
    version: 1,
    goLiveAt: null,
    preview: false,
    catalog: fakeCatalogInput(),
};

afterEach(() => {
    env.API_URL = "https://api.test";
    env.NODE_ENV = "test";
    env.NEXT_PHASE = undefined;
    env.VERCEL_ENV = undefined;
});

/** Reading the published catalogue (plans catalogue U24, KTD-10). */
describe("readLivePricing", () => {
    it("reads /public/pricing once, when the site is built", async () => {
        const fetcher = answering(live);
        const c = await readLivePricing(asFetch(fetcher));
        expect(c?.plans.map((p) => p.name)).toEqual([
            "Plan A",
            "Plan B",
            "Plan C",
        ]);
        const [url, init] = fetcher.mock.calls[0];
        expect(url).toBe("https://api.test/public/pricing");
        expect(init?.cache).toBe("force-cache");
    });

    it("no version published (404): null, the placeholder", async () => {
        expect(await readLivePricing(asFetch(answering({}, 404)))).toBeNull();
    });

    it("no API configured: null, without a request", async () => {
        env.API_URL = undefined;
        const fetcher = answering(live);
        expect(await readLivePricing(asFetch(fetcher))).toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("API down on a local build: null, the placeholder", async () => {
        env.NODE_ENV = "production";
        env.NEXT_PHASE = "phase-production-build";
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const down = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
        expect(await readLivePricing(asFetch(down))).toBeNull();
    });

    it("API down on a deployment's build: throws, so the last good site keeps serving", async () => {
        env.NODE_ENV = "production";
        env.NEXT_PHASE = "phase-production-build";
        env.VERCEL_ENV = "production";
        await expect(
            readLivePricing(asFetch(answering({}, 503))),
        ).rejects.toThrow();
        await expect(
            readLivePricing(asFetch(answering({ catalog: { plans: [] } }))),
        ).rejects.toThrow();
    });
});

describe("readPreviewPricing", () => {
    it("forwards the token, never cached", async () => {
        const fetcher = answering({ ...live, version: null, preview: true });
        const r = await readPreviewPricing("a b/c", asFetch(fetcher));
        expect(r.ok).toBe(true);
        const [url, init] = fetcher.mock.calls[0];
        expect(url).toBe("https://api.test/public/pricing?preview=a%20b%2Fc");
        expect(init?.cache).toBe("no-store");
    });

    it("a token the API refuses is expired; anything else unavailable", async () => {
        expect(
            await readPreviewPricing("t", asFetch(answering({}, 404))),
        ).toEqual({ ok: false, reason: "expired" });
        expect(
            await readPreviewPricing("t", asFetch(answering({}, 500))),
        ).toEqual({ ok: false, reason: "unavailable" });
    });
});

/** The fallback is the placeholder, never the bundled seed. */
describe("the seed", () => {
    it("is imported nowhere in saroh.in", () => {
        const root = join(__dirname, "..");
        const banned = ["pricing-catalog", "seed"].join("/");
        const hits: string[] = [];
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                if (name === "node_modules" || name.startsWith(".")) continue;
                const p = join(dir, name);
                if (statSync(p).isDirectory()) walk(p);
                else if (
                    /\.(ts|tsx|js|mjs)$/.test(name) &&
                    readFileSync(p, "utf8").includes(banned)
                ) {
                    hits.push(p);
                }
            }
        };
        walk(root);
        expect(hits).toEqual([]);
    });
});
