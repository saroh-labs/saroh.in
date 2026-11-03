import { describe, expect, it, vi } from "vitest";

import { handle, indiaHrefFor } from "./index";

const assets = (body = "ok", type = "text/plain") => ({
    fetch: vi.fn(
        async () => new Response(body, { headers: { "content-type": type } }),
    ),
});

const get = (url: string, headers: Record<string, string> = {}) =>
    new Request(url, { headers });

describe("the saroh.tech Worker", () => {
    it("302s /r/{code} home, sets the cookie and asks not to be indexed", async () => {
        const res = await handle(get("https://saroh.tech/r/abc123"), {
            ASSETS: assets(),
        });
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/");
        expect(res.headers.get("set-cookie")).toContain("saroh_ref=abc123");
        expect(res.headers.get("set-cookie")).toContain("Secure");
        expect(res.headers.get("x-robots-tag")).toBe("noindex");
    });

    it("doesn't take an odd code for a referral link", async () => {
        const env = { ASSETS: assets() };
        const res = await handle(get("https://saroh.tech/r/a;b=c"), env);
        expect(res.headers.get("set-cookie")).toBeNull();
        expect(env.ASSETS.fetch).toHaveBeenCalled();
    });

    it("indexes saroh.tech, and nothing else", async () => {
        const live = await handle(get("https://saroh.tech/x.txt"), {
            ASSETS: assets(),
        });
        expect(live.headers.get("x-robots-tag")).toBeNull();
        const preview = await handle(get("https://tech.workers.dev/x.txt"), {
            ASSETS: assets(),
        });
        expect(preview.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("the × only ever returns to a page on this site", async () => {
        const res = await handle(
            get("https://saroh.tech/region/hide", {
                referer: "https://evil.example/phish",
            }),
            { ASSETS: assets() },
        );
        expect(res.headers.get("location")).toBe("/");
        expect(res.headers.get("set-cookie")).toContain("saroh_region_bar=1");
        expect(res.headers.get("set-cookie")).toContain(
            `Max-Age=${90 * 86400}`,
        );
        const back = await handle(
            get("https://saroh.tech/region/hide", {
                referer: "https://saroh.tech/pricing",
            }),
            { ASSETS: assets() },
        );
        expect(back.headers.get("location")).toBe("/pricing");
    });

    it("points at the matching saroh.in page, or its home", () => {
        expect(indiaHrefFor("/pricing")).toBe("https://www.saroh.in/pricing");
        expect(indiaHrefFor("/tools/quote-maker")).toBe(
            "https://www.saroh.in/tools/quotation-maker",
        );
        expect(indiaHrefFor("/legal/terms")).toBe("https://www.saroh.in/");
    });
});
