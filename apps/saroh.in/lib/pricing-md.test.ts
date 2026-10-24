import { formatInr } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { pricingMarkdown } from "./pricing-md";
import { fakeCatalog } from "./pricing.fixture";

const BASE = "https://www.saroh.in";

/** `/pricing.md` (#1187): the pricing page's words, from the catalogue. */
describe("pricingMarkdown", () => {
    it("lists each plan's name, monthly price, and included rows, in the page's order", () => {
        const md = pricingMarkdown(
            BASE,
            fakeCatalog((c) => {
                c.yearly.on = false;
            }),
        );
        const a = md.indexOf("## Plan A");
        const b = md.indexOf("## Plan B");
        const c = md.indexOf("## Plan C");
        expect(a).toBeGreaterThan(0);
        expect(b).toBeGreaterThan(a);
        expect(c).toBeGreaterThan(b);
        expect(md).toContain(
            `- Monthly: **${formatInr(0)}** a month (Free for good)`,
        );
        expect(md).toContain(
            `- Monthly: **${formatInr(11_100)}** a month (+ GST)`,
        );
        expect(md).toContain(
            `- Monthly: **${formatInr(22_200)}** a month (+ GST)`,
        );
        // Plan A's card lines, in the catalogue's order.
        const planA = md.slice(a, b);
        expect(planA.indexOf("- Thing one")).toBeLessThan(
            planA.indexOf("- Few items"),
        );
        expect(md.slice(b, c)).toContain("Everything in Plan A, plus:");
        // No yearly price while yearly is off.
        expect(md).not.toContain("Yearly:");
        expect(md).toContain("Billed monthly. Prices before GST");
    });

    it("draws the compare table row for row, limits included", () => {
        const md = pricingMarkdown(BASE, fakeCatalog());
        expect(md).toContain("| | Plan A | Plan B | Plan C |");
        expect(md).toContain("| **Group one** | | | |");
        expect(md).toContain("| Products | Few | More | Most |");
        expect(md).toContain(
            "| Extra (coming soon) | Not included | Included | Included |",
        );
        expect(md.indexOf("| Website |")).toBeLessThan(
            md.indexOf("| Products |"),
        );
    });

    it("leaves a hidden row out", () => {
        const md = pricingMarkdown(BASE, fakeCatalog());
        expect(md).not.toContain("Secret");
    });

    it("shows each paid plan's yearly price while yearly is on", () => {
        const md = pricingMarkdown(BASE, fakeCatalog());
        // The fixture: pay for 10 months, get 12.
        expect(md).toContain(`- Yearly: **${formatInr(111_000)}** a year`);
        expect(md).toContain(`- Yearly: **${formatInr(222_000)}** a year`);
        expect(
            md.slice(md.indexOf("## Plan A"), md.indexOf("## Plan B")),
        ).not.toContain("Yearly:");
        expect(md).toContain("Billed yearly, pay for 10 months and get 12.");
    });

    it("lists no price and points at /pricing with no catalogue", () => {
        const md = pricingMarkdown(BASE, null);
        expect(md).toContain(`${BASE}/pricing`);
        expect(md).not.toMatch(/₹|\d/);
        expect(md).not.toContain("## Plan");
    });
});
