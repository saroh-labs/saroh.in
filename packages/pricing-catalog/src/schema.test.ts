import { describe, expect, it } from "vitest";

import { edit, fixture, fixtureInput } from "./catalog.fixture";
import { catalogSchema, cellOf, validateCatalog } from "./schema";

const errorsOf = (input: unknown) => {
    const r = validateCatalog(input);
    return r.ok ? [] : r.errors;
};

describe("the catalogue schema", () => {
    it("accepts a whole catalogue and fills the defaults", () => {
        const c = fixture();
        expect(c.plans.map((p) => p.id)).toEqual(["a", "b", "c"]);
        expect(c.plans[0].retired).toBe(false);
        expect(c.modules[0].pricing).toBe("show");
    });

    it("reads a missing cell as excluded and locked", () => {
        const c = edit(fixture(), (x) => {
            delete x.modules[0].cells.c;
        });
        expect(cellOf(c.modules[0], "c")).toEqual({
            inc: false,
            off: "locked",
        });
    });

    it("rejects two highlighted plans", () => {
        const input = fixtureInput();
        input.plans[2].featured = true;
        expect(errorsOf(input)).toContain(
            "plans: Only one plan can be highlighted",
        );
    });

    it("rejects a trial on a free plan", () => {
        const input = fixtureInput();
        input.plans[0].trial = { on: true, days: 7 };
        expect(errorsOf(input).join()).toMatch(
            /is free, so it can't have a free trial/,
        );
    });

    it("keeps a trial within 1 to 60 days", () => {
        const input = fixtureInput();
        input.plans[1].trial = { on: true, days: 61 };
        expect(errorsOf(input).length).toBeGreaterThan(0);
        input.plans[1].trial = { on: true, days: 60 };
        expect(errorsOf(input)).toEqual([]);
    });

    it("rejects yearly billing that pays for no months, or more than 12", () => {
        const input = fixtureInput();
        input.yearly = { on: true, paid: 0 };
        expect(errorsOf(input).length).toBeGreaterThan(0);
        input.yearly = { on: true, paid: 13 };
        expect(errorsOf(input).length).toBeGreaterThan(0);
    });

    it("rejects a limit that isn't a positive whole number", () => {
        for (const limit of [0, -1, 1.5]) {
            const input = fixtureInput();
            input.modules[1].cells.a = { inc: true, text: "x", limit };
            expect(errorsOf(input).length).toBeGreaterThan(0);
        }
    });

    it("rejects a price that isn't whole paise", () => {
        const input = fixtureInput();
        input.plans[1].pricePaise = 111.5;
        expect(errorsOf(input).length).toBeGreaterThan(0);
    });

    it("rejects duplicate ids, unknown groups and cells for unknown plans", () => {
        const input = fixtureInput();
        input.plans[2].id = "b";
        input.plans[2].featured = false;
        input.modules[0].group = "nowhere";
        expect(errorsOf(input).join("\n")).toMatch(
            /Two plans share the id "b"/,
        );
        expect(errorsOf(input).join("\n")).toMatch(/group that doesn't exist/);

        const other = fixtureInput();
        other.modules[0].cells.zz = { inc: true, text: "x" };
        expect(errorsOf(other).join()).toMatch(/unknown plan: zz/);
    });

    it("rejects ids that can't be a billing key", () => {
        const input = fixtureInput();
        input.plans[0].id = "Plan A";
        expect(errorsOf(input).length).toBeGreaterThan(0);
    });

    it("checks add-on kinds and modes from the design", () => {
        const withAddons = (
            edit: (addons: Record<string, unknown>[]) => void,
        ) => {
            const input = fixtureInput();
            const addons = (input.addons ?? []) as Record<string, unknown>[];
            edit(addons);
            return { ...input, addons };
        };
        const noModule = withAddons((a) => {
            a[2] = { ...a[2], module: undefined };
        });
        expect(errorsOf(noModule).join()).toMatch(/must name a module/);

        const stray = withAddons((a) => {
            a[0] = { ...a[0], module: "site" };
        });
        expect(errorsOf(stray).join()).toMatch(/names no module/);

        const badKind = withAddons((a) => {
            a[0] = { ...a[0], kind: "cookies" };
        });
        expect(errorsOf(badKind).length).toBeGreaterThan(0);

        const badMode = withAddons((a) => {
            a[0] = { ...a[0], mode: "bulk" };
        });
        expect(errorsOf(badMode).length).toBeGreaterThan(0);
    });

    it("round-trips through JSON, as a version row stores it", () => {
        const c = fixture();
        expect(catalogSchema.parse(JSON.parse(JSON.stringify(c)))).toEqual(c);
    });
});
