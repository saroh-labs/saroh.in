import { describe, expect, it, vi } from "vitest";

import sitemap from "@/app/sitemap";

vi.mock("./site-map", async (original) => {
    const real = await original<typeof import("./site-map")>();
    return {
        ...real,
        indexedPages: () => [
            { ...real.pageOf("/pricing"), updated: "2026-11-02" },
            real.pageOf("/tools/vat-calculator"),
        ],
    };
});

describe("the sitemap", () => {
    it("pairs a page with saroh.in, with its real date", () => {
        const [pricing] = sitemap();
        expect(pricing.url).toBe("https://saroh.tech/pricing");
        expect(pricing.lastModified).toBe("2026-11-02");
        expect(pricing.alternates?.languages).toEqual({
            en: "https://saroh.tech/pricing",
            "en-IN": "https://www.saroh.in/pricing",
            "x-default": "https://saroh.tech/pricing",
        });
    });

    it("gives a global-only page no pair", () => {
        expect(sitemap()[1].alternates).toBeUndefined();
    });
});
