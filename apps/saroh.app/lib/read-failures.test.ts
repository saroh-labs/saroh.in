import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const shop = vi.hoisted(() => ({
    answer: null as Response | null,
    refused: vi.fn(),
}));

vi.mock("@/env", () => ({
    env: {
        API_URL: "https://api.test",
        NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app",
    },
}));
vi.mock("next/headers", () => ({
    headers: () => Promise.resolve(new Headers({ host: "rye.saroh.app" })),
}));
vi.mock("./catalogue", () => ({
    shopFetch: vi.fn(() => Promise.resolve(shop.answer?.clone() ?? null)),
}));
vi.mock("@/lib/page-cache/site-rules", () => ({
    dontCachePage: shop.refused,
    listsProducts: vi.fn(),
}));

import { getBookingVisit } from "./booking-page";
import {
    getPublishedPost,
    getPublishedPosts,
    readPublishedPosts,
    siteReadFailed,
} from "./publication";
import { getCheckoutOptions } from "./shop-checkout";
import { getSiteContact } from "./site-contact";
import { getFooterFacts } from "./site-footer";
import { getPublicPacks } from "./site-packs";
import { getPublicPlans } from "./site-plans";
import { getProductGridFeeds } from "./site-product-grids";

/**
 * A read that failed is not "none" (`frontend-data-and-state.md`): a page
 * drawn from it is never kept for the next visitor, and a block says so
 * rather than vanishing. A 404 from these reads is the API's real "none":
 * the module is off, the shop closed.
 */

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
const failures: [string, Response | null][] = [
    ["a 500", json({ error: {} }, 500)],
    ["a 429", json({ error: {} }, 429)],
    ["no answer", null],
    ["a body that isn't its shape", json({ nope: true })],
];

function answerAll(response: Response | Error) {
    vi.stubGlobal(
        "fetch",
        vi.fn(() =>
            response instanceof Error
                ? Promise.reject(response)
                : Promise.resolve(response.clone()),
        ),
    );
}

beforeEach(() => {
    shop.refused.mockClear();
    vi.unstubAllGlobals();
});

describe.each(failures)("the server's reads on %s", (_name, answer) => {
    beforeEach(() => {
        shop.answer = answer;
    });

    it("plans say failed, and the page isn't kept", async () => {
        const read = await getPublicPlans("site_1");
        expect(read).toMatchObject({ plans: [], failed: true });
        expect(shop.refused).toHaveBeenCalled();
    });

    it("class packs say failed, and the page isn't kept", async () => {
        const read = await getPublicPacks("site_1");
        expect(read).toMatchObject({ packs: [], failed: true });
        expect(shop.refused).toHaveBeenCalled();
    });

    it("a Product grid says failed, and the page isn't kept", async () => {
        const feeds = await getProductGridFeeds(
            [{ type: "productGrid", content: {} }],
            "site_1",
        );
        expect(feeds?.[0]).toMatchObject({ products: [], failed: true });
        expect(shop.refused).toHaveBeenCalled();
    });

    it("checkout options are null, and the page isn't kept", async () => {
        await expect(getCheckoutOptions("site_x")).resolves.toBeNull();
        expect(shop.refused).toHaveBeenCalled();
    });
});

describe("the API's real none, a 404", () => {
    beforeEach(() => {
        shop.answer = json({ error: {} }, 404);
    });

    it("is an empty block, kept as any page", async () => {
        expect(await getPublicPlans("site_1")).toEqual({
            plans: [],
            payOnline: false,
        });
        expect(await getPublicPacks("site_1")).toEqual({
            packs: [],
            payOnline: false,
        });
        const feeds = await getProductGridFeeds(
            [{ type: "productGrid", content: {} }],
            "site_1",
        );
        expect(feeds?.[0]?.failed).toBeUndefined();
        await expect(getCheckoutOptions("site_404")).resolves.toBeNull();
        expect(shop.refused).not.toHaveBeenCalled();
    });
});

describe("the posts", () => {
    it("are null on a failed read, and the page isn't kept", async () => {
        answerAll(json({}, 500));
        await expect(readPublishedPosts("site_1")).resolves.toBeNull();
        expect(shop.refused).toHaveBeenCalled();
    });

    it("read as none only where that's safe: the sitemap", async () => {
        answerAll(new Error("offline"));
        await expect(getPublishedPosts("site_1")).resolves.toEqual([]);
    });

    it("are empty for a site with none", async () => {
        answerAll(json({ posts: [] }));
        await expect(readPublishedPosts("site_1")).resolves.toEqual([]);
        expect(shop.refused).not.toHaveBeenCalled();
    });

    it("say a post has gone only when the API says it has", async () => {
        answerAll(json({}, 404));
        await expect(getPublishedPost("site_1", "a")).resolves.toBeNull();
        answerAll(json({}, 500));
        await expect(getPublishedPost("site_1", "a")).rejects.toThrow();
    });

    it("throw on a failed post read, and the page isn't kept", async () => {
        for (const answer of [
            json({}, 500),
            new Error("offline"),
            json({ nope: true }),
        ]) {
            shop.refused.mockClear();
            answerAll(answer);
            await expect(getPublishedPost("site_1", "a")).rejects.toThrow();
            expect(shop.refused).toHaveBeenCalledWith("post unavailable");
        }
    });

    it("don't refuse the page for a post that really has gone", async () => {
        answerAll(json({}, 404));
        await getPublishedPost("site_1", "a");
        expect(shop.refused).not.toHaveBeenCalled();
    });
});

describe("the footer and the header's facts", () => {
    it("aren't kept when their read failed", async () => {
        answerAll(json({}, 500));
        await getSiteContact("site_2");
        expect(shop.refused).toHaveBeenCalledWith("contact unavailable");
        await getFooterFacts("site_2");
        expect(shop.refused).toHaveBeenCalledWith("footer unavailable");
        await getBookingVisit("site_2");
        expect(shop.refused).toHaveBeenCalledWith("visit unavailable");
    });
});

describe("a host with no live site", () => {
    it("is a failed read on anything but a 404", async () => {
        answerAll(json({}, 500));
        await expect(siteReadFailed("rye.saroh.app")).resolves.toBe(true);
        answerAll(new Error("offline"));
        await expect(siteReadFailed("rye.saroh.app")).resolves.toBe(true);
    });

    it("is really nothing on a 404, the custom hostname's reads too", async () => {
        answerAll(json({}, 404));
        await expect(siteReadFailed("rye.saroh.app")).resolves.toBe(false);
        await expect(siteReadFailed("shop.example.com")).resolves.toBe(false);
    });
});

/**
 * Every read a kept public page can be drawn from has to say what a failure
 * means for the page cache. The lists below are the answer for those that
 * don't: a new reader is added to them only with a reason.
 */
describe("a new reader of the public API", () => {
    const APP = path.join(__dirname, "..");

    /** Each answers something the route refuses by itself, or isn't kept. */
    const NOT_ON_A_KEPT_PAGE: Record<string, string> = {
        "lib/catalogue.ts": "lookups with reason: the routes refuse",
        "lib/customer-session.ts": "one customer's: never kept",
        "lib/images/resize.ts": "a photo's route: no page is drawn from it",
        "lib/qr-resolve.ts": "a short link: /q is never kept",
        "lib/site-view.ts": "a beacon: sends, reads nothing onto a page",
        "lib/stock-watch.ts": "one customer's token: never kept",
        "lib/test-release.ts": "a test host: never kept",
        "lib/waitlist-claim.ts": "one customer's token: never kept",
    };
    /** Some of each file's reads refuse; the routes answer for the rest. */
    const SOME_READS_THE_ROUTE_REFUSES: Record<string, string> = {
        "lib/booking-page.ts": "getBookingPage's lookup: /book refuses",
        "lib/publication.ts":
            "a site's read throws from the layout; previews aren't kept",
    };

    /** The code alone: a comment naming a call isn't the call. */
    const codeOf = (source: string) =>
        source
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const isReader = (code: string) =>
        /shopFetch\(|\/public\/(sites|services)\b/.test(code);
    const calls = (code: string, pattern: RegExp) =>
        code.match(pattern)?.length ?? 0;
    /** Whether a reader has fewer refusals than reads. */
    const refusesTooLittle = (code: string) =>
        calls(code, /\bdontCachePage\(/g) <
        Math.max(1, calls(code, /\b(?:shopFetch|fetch)\(/g));

    function sources(dir: string): string[] {
        return readdirSync(path.join(APP, dir), {
            withFileTypes: true,
        }).flatMap((entry) => {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) return sources(file);
            return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)
                ? [file]
                : [];
        });
    }
    const readers = ["lib", "components"]
        .flatMap(sources)
        .map((file) => ({
            file,
            code: codeOf(readFileSync(path.join(APP, file), "utf8")),
        }))
        .filter(({ code }) => isReader(code));

    it("refuses the page cache on a failure, or is listed here", () => {
        expect(readers.length).toBeGreaterThan(5);
        const silent = readers
            .filter(
                ({ file, code }) =>
                    !(file in NOT_ON_A_KEPT_PAGE) &&
                    !(file in SOME_READS_THE_ROUTE_REFUSES) &&
                    refusesTooLittle(code),
            )
            .map(({ file }) => file);
        expect(silent).toEqual([]);
    });

    it("has no list entry it doesn't need", () => {
        const found = readers.map(({ file }) => file);
        for (const file of [
            ...Object.keys(NOT_ON_A_KEPT_PAGE),
            ...Object.keys(SOME_READS_THE_ROUTE_REFUSES),
        ]) {
            expect(found).toContain(file);
        }
    });

    it("isn't fooled by the word, a second read, or a services read", () => {
        const fetchThem = (url: string) =>
            `const a = await fetch(\`\${API}${url}\`);`;
        const refuse = 'dontCachePage("x");';
        for (const silent of [
            fetchThem("/public/services"),
            `// dontCachePage here\n${fetchThem("/public/sites/x")}`,
            `const words = "dontCachePage";\n${fetchThem("/public/sites/x")}`,
            `${fetchThem("/public/sites/x")}\n${fetchThem("/public/sites/y")}\n${refuse}`,
        ]) {
            const code = codeOf(silent);
            expect(isReader(code)).toBe(true);
            expect(refusesTooLittle(code)).toBe(true);
        }
        const fine = codeOf(`${fetchThem("/public/sites/x")}\n${refuse}`);
        expect(refusesTooLittle(fine)).toBe(false);
    });
});
