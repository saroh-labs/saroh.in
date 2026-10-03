import { describe, expect, it } from "vitest";

import { GET } from "./route";

const get = (q: string) =>
    GET(new Request(`https://www.saroh.test/pricing/preview${q}`));

/** The draft preview's token swap (KTD-10). */
describe("GET /pricing/preview", () => {
    it("swaps the token for an HttpOnly cookie and strips it from the address", () => {
        const res = get("?token=abc.def");
        expect(res.status).toBe(303);
        expect(res.headers.get("location")).toBe(
            "https://www.saroh.test/pricing/draft",
        );
        const cookie = res.headers.get("set-cookie") ?? "";
        expect(cookie).toMatch(/^saroh_pricing_preview=abc\.def;/);
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/Secure/i);
        expect(cookie).toMatch(/Path=\/pricing\/draft/);
        expect(cookie).toMatch(/Max-Age=900/);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(res.headers.get("x-robots-tag")).toContain("noindex");
        expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    });

    it("no token: back to the published pricing, no cookie", () => {
        const res = get("");
        expect(res.headers.get("location")).toBe(
            "https://www.saroh.test/pricing",
        );
        expect(res.headers.get("set-cookie")).toBeNull();
    });
});
