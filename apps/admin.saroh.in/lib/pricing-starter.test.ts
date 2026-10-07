import { validateCatalog } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { blankCatalog, starterCatalog } from "./pricing-starter";

describe("the first-run catalogues", () => {
    it("starter: the sample's shape with none of its numbers, and valid", () => {
        const c = starterCatalog();
        expect(c.plans.length).toBeGreaterThan(1);
        expect(c.modules.length).toBeGreaterThan(0);
        expect(c.plans.every((p) => p.pricePaise === 0 && !p.trial)).toBe(true);
        expect(c.addons).toEqual([]);
        for (const m of c.modules) {
            for (const cell of Object.values(m.cells)) {
                if (cell.inc) expect(cell.limit).toBeNull();
            }
        }
        expect(validateCatalog(c).ok).toBe(true);
    });

    it("hands back a new catalogue each time", () => {
        const a = starterCatalog();
        const first = a.plans.at(0);
        if (!first) throw new Error("starter has plans");
        first.name = "Changed";
        expect(starterCatalog().plans[0]?.name).not.toBe("Changed");
    });

    it("blank: one free plan and one group, and valid", () => {
        const c = blankCatalog();
        expect(c.plans).toHaveLength(1);
        expect(c.groups).toHaveLength(1);
        expect(c.modules).toEqual([]);
        expect(validateCatalog(c).ok).toBe(true);
    });
});
