import { validateCatalog } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { addModule, addPlan, groupModules } from "./catalog-edits";
import {
    addGroup,
    canRemoveGroup,
    isUnpublishedModule,
    isUnpublishedPlan,
    removeGroup,
    removeModule,
    removePlan,
    renameGroup,
    restoreModule,
    restorePlan,
} from "./structure-edits";
import { tabCatalog } from "./tab-test-kit";

describe("row groups", () => {
    it("adds an empty group at the end, which the matrix can still show", () => {
        const c = tabCatalog();
        const id = addGroup(c, "Space and traffic", 1);
        expect(c.groups.at(-1)).toEqual({ id, name: "Space and traffic" });
        expect(groupModules(c).map((g) => g.id)).not.toContain(id);
        expect(
            groupModules(c, undefined, { keepEmpty: true }).map((g) => g.id),
        ).toContain(id);
        expect(validateCatalog(c).ok).toBe(true);
    });

    it("puts a module in the group asked for", () => {
        const c = tabCatalog();
        const g = addGroup(c, "Space and traffic", 1);
        const m = addModule(c, 2, g);
        expect(c.modules.find((x) => x.id === m)?.group).toBe(g);
    });

    it("renames a group and keeps its id", () => {
        const c = tabCatalog();
        renameGroup(c, "g2", "Money");
        expect(c.groups.find((g) => g.id === "g2")?.name).toBe("Money");
    });

    it("removes a group only once it's empty", () => {
        const c = tabCatalog();
        expect(canRemoveGroup(c, "g2")).toBe(false);
        expect(removeGroup(c, "g2")).toBe(false);
        expect(c.groups).toHaveLength(2);
        const id = addGroup(c, "Empty", 1);
        expect(removeGroup(c, id)).toBe(true);
        expect(c.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    });
});

describe("taking back what was only in the draft", () => {
    it("removes a new plan with its cells, and Undo puts both back", () => {
        const live = tabCatalog();
        const c = tabCatalog();
        const id = addPlan(c, 1);
        const first = c.modules.at(0);
        if (!first) throw new Error("fixture has modules");
        first.cells[id] = { inc: false, off: "hidden" };
        expect(isUnpublishedPlan(live, id)).toBe(true);
        const removed = removePlan(c, live, id);
        expect(removed).not.toBeNull();
        expect(c.plans.map((p) => p.id)).toEqual(["a", "b", "c"]);
        expect(c.modules[0]?.cells[id]).toBeUndefined();
        if (!removed) throw new Error("expected the plan to go");
        restorePlan(c, removed);
        expect(c.plans.map((p) => p.id)).toEqual(["a", "b", "c", id]);
        expect(c.modules[0]?.cells[id]).toEqual({ inc: false, off: "hidden" });
    });

    it("never removes a live plan (it's retired instead) or the last one", () => {
        const live = tabCatalog();
        const c = tabCatalog();
        expect(isUnpublishedPlan(live, "b")).toBe(false);
        expect(removePlan(c, live, "b")).toBeNull();
        const one = tabCatalog();
        one.plans = one.plans.slice(0, 1);
        expect(removePlan(one, null, "a")).toBeNull();
    });

    it("removes a new module with the add-on that switches it on; Undo restores both", () => {
        const live = tabCatalog();
        const c = tabCatalog();
        const id = addModule(c, 1);
        if (!id) throw new Error("fixture has groups");
        c.addons = [
            {
                id: "extra",
                kind: "module",
                module: id,
                name: "Extra",
                pricePaise: 0,
                mode: "unit",
                qty: 1,
            },
        ];
        const at = c.modules.findIndex((m) => m.id === id);
        const removed = removeModule(c, live, id);
        expect(removed).not.toBeNull();
        expect(c.modules.some((m) => m.id === id)).toBe(false);
        expect(c.addons).toEqual([]);
        if (!removed) throw new Error("expected the module to go");
        restoreModule(c, removed);
        expect(c.modules.findIndex((m) => m.id === id)).toBe(at);
        expect(c.addons.map((a) => a.id)).toEqual(["extra"]);
    });

    it("never removes a live module (it's hidden instead)", () => {
        const live = tabCatalog();
        const c = tabCatalog();
        expect(isUnpublishedModule(live, "things")).toBe(false);
        expect(removeModule(c, live, "things")).toBeNull();
    });

    it("with nothing live, everything in the draft can be taken back", () => {
        expect(isUnpublishedPlan(null, "a")).toBe(true);
        expect(isUnpublishedModule(null, "things")).toBe(true);
    });
});
