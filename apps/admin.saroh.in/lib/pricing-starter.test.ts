import { validateCatalog } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import {
    addKnownRow,
    blankCatalog,
    knownRowsMissing,
    starterCatalog,
} from "./pricing-starter";

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

describe("rows the product knows by id (DEC-158)", () => {
    it("the starter has the variants row, with no number on it", () => {
        const c = starterCatalog();
        expect(knownRowsMissing(c)).toEqual([]);
        const row = c.modules.find((m) => m.id === "variants");
        for (const cell of Object.values(row?.cells ?? {})) {
            expect(cell).toMatchObject({ inc: true, limit: null });
        }
    });

    it("offers it to a catalogue made before it, and to no other", () => {
        expect(knownRowsMissing(blankCatalog())).toEqual([
            { id: "variants", name: "Variants" },
        ]);
    });

    it("adds it under its own id, beside Products, capping nothing yet", () => {
        const c = starterCatalog();
        c.modules = c.modules.filter((m) => m.id !== "variants");
        expect(addKnownRow(c, "variants")).toBe("variants");
        const at = c.modules.findIndex((m) => m.id === "variants");
        expect(c.modules[at - 1]?.id).toBe("products");
        const row = c.modules[at];
        expect(row).toMatchObject({
            name: "Variants",
            group: c.modules[at - 1]?.group,
            pricing: "hidden",
        });
        // A cell for every plan of THIS catalogue, each with no limit.
        expect(Object.keys(row?.cells ?? {}).sort()).toEqual(
            c.plans.map((p) => p.id).sort(),
        );
        for (const cell of Object.values(row?.cells ?? {})) {
            expect(cell).toMatchObject({ inc: true, limit: null });
        }
        expect(validateCatalog(c).ok).toBe(true);
        expect(knownRowsMissing(c)).toEqual([]);
    });

    it("goes in the first group of a catalogue with no Products row", () => {
        const c = blankCatalog();
        expect(addKnownRow(c, "variants")).toBe("variants");
        expect(c.modules).toHaveLength(1);
        expect(c.modules[0]).toMatchObject({
            id: "variants",
            group: "features",
        });
        expect(Object.keys(c.modules[0]?.cells ?? {})).toEqual(["free"]);
        expect(validateCatalog(c).ok).toBe(true);
    });

    it("adds nothing twice, nothing it doesn't know, and nothing with no group", () => {
        const c = starterCatalog();
        expect(addKnownRow(c, "variants")).toBeNull();
        expect(addKnownRow(blankCatalog(), "products")).toBeNull();
        const bare = blankCatalog();
        bare.groups = [];
        expect(addKnownRow(bare, "variants")).toBeNull();
    });
});
