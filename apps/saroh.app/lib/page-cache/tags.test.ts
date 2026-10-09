import { describe, expect, it } from "vitest";

import {
    productTag,
    siteOfTag,
    siteProductsTag,
    siteTag,
    tagsBySite,
} from "./tags";

/**
 * The tags the API sends (`page-cache.job.spec.ts` pins the same strings):
 * a page tagged here is the page a revalidation there names.
 */
describe("page cache tags (#863)", () => {
    it("names a site, its product lists and one product's page", () => {
        expect(siteTag("site_1")).toBe("site:site_1");
        expect(siteProductsTag("site_1")).toBe("site:site_1:products");
        expect(productTag("site_1", "prod_1")).toBe(
            "site:site_1:product:prod_1",
        );
    });

    it("refuses an id that could break the tag apart", () => {
        expect(() => siteTag("a:b")).toThrow();
        expect(() => siteTag("")).toThrow();
        expect(() => productTag("site_1", "x y")).toThrow();
        expect(() => siteProductsTag("site 1")).toThrow();
    });

    it("finds the site every tag belongs to, and nothing else", () => {
        expect(siteOfTag("site:site_1")).toBe("site_1");
        expect(siteOfTag("site:site_1:products")).toBe("site_1");
        expect(siteOfTag("site:site_1:product:prod_1")).toBe("site_1");
        expect(siteOfTag("site:site_1:other")).toBeNull();
        expect(siteOfTag("product:prod_1")).toBeNull();
        expect(siteOfTag("site:")).toBeNull();
    });

    it("groups tags by site, once each, leaving out malformed ones", () => {
        const grouped = tagsBySite([
            "site:a",
            "site:a:products",
            "site:b:product:p",
            "site:a",
            "nonsense",
        ]);
        expect(Object.fromEntries(grouped)).toEqual({
            a: ["site:a", "site:a:products"],
            b: ["site:b:product:p"],
        });
    });
});
