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

    it("shares the referral cookie with the app, which reads it at setup", async () => {
        const res = await handle(get("https://saroh.tech/r/abc123"), {
            ASSETS: assets(),
        });
        expect(res.headers.get("set-cookie")).toContain("Domain=saroh.tech");
    });

    describe("?ref= on a page, the Made with Saroh credit's link", () => {
        const page = async (url: string) => {
            vi.stubGlobal(
                "HTMLRewriter",
                class {
                    on() {
                        return this;
                    }
                    transform(r: Response) {
                        return r;
                    }
                },
            );
            const res = await handle(get(url), {
                ASSETS: assets("<html></html>", "text/html"),
            });
            vi.unstubAllGlobals();
            return res;
        };

        it("keeps a business's code, and still serves the page", async () => {
            const res = await page("https://saroh.tech/?ref=abcd2345");
            expect(res.status).toBe(200);
            const set = res.headers.get("set-cookie");
            expect(set).toContain("saroh_ref=abcd2345");
            expect(set).toContain("Domain=saroh.tech");
            expect(set).toContain("Max-Age=7776000");
        });

        it("leaves anything not shaped like a code", async () => {
            for (const ref of ["short", "abcd2345;x=y", "abcd234l"]) {
                const res = await page(
                    `https://saroh.tech/?ref=${encodeURIComponent(ref)}`,
                );
                expect(res.headers.get("set-cookie"), ref).toBeNull();
            }
        });
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
        const elsewhere = await handle(
            get("https://saroh.tech/region/hide", {
                referer: "https://saroh.tech//evil.com/",
            }),
            { ASSETS: assets() },
        );
        expect(elsewhere.headers.get("location")).toBe("/");
    });

    it("points at the matching saroh.in page, or its home", () => {
        expect(indiaHrefFor("/pricing")).toBe("https://www.saroh.in/pricing");
        expect(indiaHrefFor("/tools/quote-maker")).toBe(
            "https://www.saroh.in/tools/quotation-maker",
        );
        expect(indiaHrefFor("/legal/terms")).toBe("https://www.saroh.in/");
    });
});

describe("behind the access key", () => {
    const env = () => ({
        ASSETS: assets(),
        DEV_ACCESS_KEY: "right-key",
        DEV_ACCESS_COOKIE_DOMAIN: ".global-dev.example",
    });
    const site = "https://global-dev.example/";

    it("shows nothing without the key, on any path", async () => {
        for (const path of ["", "pricing", "r/abc123", "region/hide"]) {
            const e = env();
            const res = await handle(get(`${site}${path}`), e);
            expect(res.status).toBe(404);
            expect(res.headers.get("x-robots-tag")).toContain("noindex");
            expect(e.ASSETS.fetch).not.toHaveBeenCalled();
        }
        const wrong = await handle(get(`${site}?access=wrong`), env());
        expect(wrong.status).toBe(404);
        const forged = await handle(
            get(site, { cookie: "saroh-dev-access=right-key" }),
            env(),
        );
        expect(forged.status).toBe(404);
    });

    it("lets the key in, and the cookie it sets opens the site", async () => {
        const res = await handle(get(`${site}pricing?access=right-key`), env());
        expect(res.status).toBe(303);
        expect(res.headers.get("location")).toBe(`${site}pricing`);
        const set = res.headers.get("set-cookie") ?? "";
        expect(set).toContain("Domain=.global-dev.example");
        expect(set).toContain("HttpOnly");
        expect(set).not.toContain("right-key");
        const pair = set.split(";")[0] ?? "";
        const e = env();
        const next = await handle(get(`${site}pricing`, { cookie: pair }), e);
        expect(next.status).toBe(200);
        expect(e.ASSETS.fetch).toHaveBeenCalled();
    });

    it("stays open where no key is set", async () => {
        const res = await handle(get("https://saroh.tech/"), {
            ASSETS: assets(),
        });
        expect(res.status).toBe(200);
    });
});
