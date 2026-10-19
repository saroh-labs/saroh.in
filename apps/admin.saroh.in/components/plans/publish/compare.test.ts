import type { Cell } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { tabCatalog } from "../plans/tab-test-kit";
import { comparePlans } from "./compare";

describe("comparePlans", () => {
    it("doesn't list a cell read back with its keys in another order", () => {
        const live = tabCatalog();
        const draft = structuredClone(live);
        const m = draft.modules[0];
        const planId = draft.plans[0].id;
        const cell = m.cells[planId];
        // The same cell, keys reversed: how the API hands a draft back.
        m.cells[planId] = Object.fromEntries(
            Object.entries(cell).reverse(),
        ) as Cell;

        const plan = comparePlans(live, draft).find((p) => p.planId === planId);
        expect(plan?.lines).toEqual([]);
        expect(plan?.same).toBe("No changes");
    });
});
