import { validateCatalog } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import type { ModuleUsage } from "@/lib/pricing-types";

import {
    addModule,
    addPlan,
    canMove,
    errorsByPath,
    freshId,
    moveModule,
    parseLimit,
    parseRupees,
    patchIncluded,
    rupeesText,
    sameCell,
    setModuleGroup,
    toggleFeatured,
    usageLine,
} from "./catalog-edits";
import { tabCatalog } from "./tab-test-kit";

describe("money and limits as typed", () => {
    it("reads rupees into whole paise without float maths", () => {
        expect(parseRupees("0")).toBe(0);
        expect(parseRupees("499")).toBe(49_900);
        expect(parseRupees(" 499.5 ")).toBe(49_950);
        expect(parseRupees("0.29")).toBe(29);
        expect(parseRupees("1.1")).toBe(110);
        expect(parseRupees("123456789.99")).toBe(12_345_678_999);
    });

    it("refuses what isn't a price", () => {
        for (const t of ["", "-5", "abc", "1e3", "4.999", "1,234", ".5", "5."])
            expect(parseRupees(t)).toBeNull();
    });

    it("shows paise as rupees, two decimals only when there are paise", () => {
        expect(rupeesText(0)).toBe("0");
        expect(rupeesText(49_900)).toBe("499");
        expect(rupeesText(49_905)).toBe("499.05");
        expect(rupeesText(49_950)).toBe("499.50");
    });

    it("takes a limit as blank or a whole number above 0", () => {
        expect(parseLimit("")).toBeNull();
        expect(parseLimit("  ")).toBeNull();
        expect(parseLimit("12")).toBe(12);
        for (const t of ["0", "-1", "2.5", "ten"])
            expect(parseLimit(t)).toBeUndefined();
    });
});

describe("cells", () => {
    it("compares cells field by field", () => {
        expect(
            sameCell(
                {
                    inc: true,
                    text: "a",
                    card: "",
                    limit: null,
                    per: "",
                    soft: false,
                },
                {
                    inc: true,
                    text: "a",
                    card: "",
                    limit: null,
                    per: "",
                    soft: false,
                },
            ),
        ).toBe(true);
        expect(
            sameCell(
                {
                    inc: true,
                    text: "a",
                    card: "",
                    limit: 1,
                    per: "",
                    soft: false,
                },
                {
                    inc: true,
                    text: "a",
                    card: "",
                    limit: 1,
                    per: "month",
                    soft: false,
                },
            ),
        ).toBe(false);
        expect(
            sameCell(
                { inc: false, off: "locked" },
                { inc: false, off: "hidden" },
            ),
        ).toBe(false);
    });
});

describe("soft caps", () => {
    it("counts soft and hard as different cells", () => {
        const cell = {
            inc: true,
            text: "a",
            card: "",
            limit: 3,
            per: "",
        } as const;
        expect(
            sameCell({ ...cell, soft: true }, { ...cell, soft: false }),
        ).toBe(false);
    });

    it("turns a cap soft, and clears soft with the limit", () => {
        const c = tabCatalog();
        patchIncluded(c, "things", "a", { soft: true });
        expect(c.modules[0]?.cells.a).toMatchObject({ limit: 11, soft: true });
        patchIncluded(c, "things", "a", { limit: null });
        expect(c.modules[0]?.cells.a).toMatchObject({
            limit: null,
            soft: false,
        });
    });
});

describe("validation messages", () => {
    it("keys the catalogue's messages by the field they're about", () => {
        const c = tabCatalog();
        c.plans = c.plans.map((p) =>
            p.id === "a"
                ? { ...p, name: "" }
                : p.id === "c"
                  ? { ...p, featured: true }
                  : p,
        );
        const r = validateCatalog(c);
        expect(r.ok).toBe(false);
        const by = errorsByPath(r.ok ? [] : r.errors);
        expect(by.get("plans.0.name")).toBe("This can't be blank");
        expect(by.get("plans")).toBe("Only one plan can be highlighted");
    });
});

describe("plans", () => {
    it("adds a plan with a fresh, valid id", () => {
        const c = tabCatalog();
        const a = addPlan(c, 1);
        const b = addPlan(c, 1);
        expect(a).not.toBe(b);
        expect(validateCatalog(c).ok).toBe(true);
        expect(freshId("p", ["p1"], 1)).toBe("p2");
    });

    it("highlights one plan, or none when the highlighted one is clicked again", () => {
        const c = tabCatalog();
        toggleFeatured(c, "c");
        expect(c.plans.map((p) => p.featured)).toEqual([false, false, true]);
        toggleFeatured(c, "c");
        expect(c.plans.some((p) => p.featured)).toBe(false);
    });
});

describe("modules", () => {
    it("moves only within the module's group", () => {
        const c = tabCatalog();
        expect(canMove(c, "things", -1)).toBe(false);
        expect(canMove(c, "gadgets", 1)).toBe(false);
        expect(canMove(c, "doodads", -1)).toBe(false);
        moveModule(c, "gadgets", -1);
        expect(c.modules.map((m) => m.id)).toEqual([
            "things",
            "gadgets",
            "widgets",
            "doodads",
        ]);
        moveModule(c, "things", -1);
        expect(c.modules[0]?.id).toBe("things");
    });

    it("regroups a module at the end of its new group", () => {
        const c = tabCatalog();
        setModuleGroup(c, "things", "g2");
        expect(c.modules.map((m) => `${m.id}:${m.group}`)).toEqual([
            "widgets:g1",
            "gadgets:g1",
            "doodads:g2",
            "things:g2",
        ]);
    });

    it("adds a module at the end of the first group, or not at all without one", () => {
        const c = tabCatalog();
        const id = addModule(c, 7);
        expect(c.modules.map((m) => m.id)).toEqual([
            "things",
            "widgets",
            "gadgets",
            id,
            "doodads",
        ]);
        expect(validateCatalog(c).ok).toBe(true);
        c.groups = [];
        expect(addModule(c)).toBeNull();
    });
});

describe("the usage line", () => {
    const usage = (values: number[] | null, line: string | null = null) =>
        ({
            moduleId: "things",
            businesses: values?.length ?? 2,
            measured: values !== null,
            using: null,
            highest: null,
            over: null,
            near: null,
            values,
            line,
        }) satisfies ModuleUsage;
    const capped = (limit: number | null) =>
        ({
            inc: true,
            text: "",
            card: "",
            limit,
            per: "",
            soft: false,
        }) as const;

    it("says the plan has nobody, or nobody using it", () => {
        expect(usageLine(usage([]), "Plan A", capped(5))).toBe(
            "Nobody on Plan A yet",
        );
        expect(usageLine(usage([0, 0]), "Plan A", capped(5))).toBe(
            "Nobody on Plan A uses it",
        );
    });

    it("counts over and near against the limit on screen", () => {
        expect(usageLine(usage([9, 4, 0]), "A", capped(5))).toBe(
            "2 of 3 use it · highest 9 · 1 over the limit",
        );
        expect(usageLine(usage([9, 4, 0]), "A", capped(10))).toBe(
            "2 of 3 use it · highest 9 · 1 at 80%+",
        );
        expect(usageLine(usage([1, 1]), "A", capped(null))).toBe(
            "2 of 2 use it",
        );
    });

    it("keeps the API's line for a module that isn't counted", () => {
        expect(usageLine(usage(null, "Nobody on A yet"), "A", capped(5))).toBe(
            "Nobody on A yet",
        );
        expect(usageLine(undefined, "A", capped(5))).toBeNull();
    });
});
