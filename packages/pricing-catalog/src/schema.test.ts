import { describe, expect, it } from "vitest";

import { resolveAccess, resolveAllAccess } from "./access";
import { cardLines } from "./card-lines";
import { edit, fixture, fixtureInput } from "./catalog.fixture";
import { entitlementsFor } from "./plan-rows";
import {
    addonMaxQuantity,
    addonOfferedOn,
    addonPlanNames,
    AUTOPAY_CHARGES_DEFAULT,
    AUTOPAY_CHARGES_MAX,
    autopayCharges,
    catalogSchema,
    cellOf,
    MAX_ADDON_QUANTITY,
    parseCatalog,
    trialFirstPaise,
    validateCatalog,
} from "./schema";

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

    // A version published while "View-only people" was sold (DEC-105)
    // still carries its row; DEC-155 retired it.
    describe("a snapshot with the retired reviewers row", () => {
        const old = () => {
            const input = fixtureInput();
            input.modules.push({
                id: "reviewers",
                name: "View-only people",
                group: "g2",
                what: "People who only look.",
                cells: {
                    a: { inc: true, text: "1", card: "", limit: 1 },
                    b: { inc: true, text: "2", card: "2 lookers", limit: 2 },
                    c: { inc: true, text: "22", card: "", limit: 22 },
                },
            });
            return input;
        };

        it("still reads, without the row", () => {
            const r = validateCatalog(old());
            expect(r.ok).toBe(true);
            const c = catalogSchema.parse(old());
            expect(c.modules.map((m) => m.id)).not.toContain("reviewers");
            expect(c.modules.map((m) => m.id)).toEqual(
                fixture().modules.map((m) => m.id),
            );
        });

        it("caps and shows nothing for it, on any plan", () => {
            const c = catalogSchema.parse(old());
            const access = { catalog: c, planId: "a", now: new Date(0) };
            expect(
                resolveAllAccess(access).map((m) => m.moduleId),
            ).not.toContain("reviewers");
            // Asked for by name it is a row the catalogue doesn't know: on,
            // with no cap.
            expect(resolveAccess(access, "reviewers")).toMatchObject({
                state: "on",
                limit: null,
            });
            expect(entitlementsFor(c, "a")).not.toHaveProperty("reviewers");
            expect(cardLines(c, "b").lines.map((l) => l.t)).not.toContain(
                "2 lookers",
            );
            // The team's own cap is untouched.
            expect(resolveAccess(access, "members").limit).toBe(1);
        });

        it("drops an add-on that only switched it on, and keeps the rest", () => {
            const input = old();
            input.addons?.push({
                id: "lookers-alone",
                kind: "module",
                module: "reviewers",
                name: "Lookers",
                pricePaise: 1_100,
                mode: "pack",
                qty: 1,
            });
            const r = validateCatalog(input);
            expect(r.ok).toBe(true);
            const c = catalogSchema.parse(input);
            expect(c.addons.map((a) => a.id)).toEqual(
                fixture().addons.map((a) => a.id),
            );
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

    it("keeps a paid first month within the plan's monthly price", () => {
        const input = fixtureInput();
        const price = input.plans[1].pricePaise;
        input.plans[1].trial = { on: true, days: 30, firstPaise: price + 1 };
        expect(errorsOf(input).join()).toMatch(
            /first month can't cost more than a month/,
        );
        input.plans[1].trial = { on: true, days: 30, firstPaise: 7 };
        expect(errorsOf(input)).toEqual([]);
    });

    it("reads a plan's first-month charge only while its offer is on", () => {
        expect(
            trialFirstPaise({ trial: { on: true, days: 30, firstPaise: 7 } }),
        ).toBe(7);
        expect(
            trialFirstPaise({ trial: { on: false, days: 30, firstPaise: 7 } }),
        ).toBe(0);
        expect(trialFirstPaise({ trial: { on: true, days: 30 } })).toBe(0);
        expect(trialFirstPaise({})).toBe(0);
    });

    it("rejects yearly billing that pays for no months, or more than 12", () => {
        const input = fixtureInput();
        input.yearly = { on: true, paid: 0 };
        expect(errorsOf(input).length).toBeGreaterThan(0);
        input.yearly = { on: true, paid: 13 };
        expect(errorsOf(input).length).toBeGreaterThan(0);
    });

    describe("how many monthly charges one autopay covers (DEC-161)", () => {
        it("is 12 for a version published before the setting", () => {
            const input = fixtureInput() as Record<string, unknown>;
            delete input.autopay;
            const c = parseCatalog(input);
            expect(c.autopay).toEqual({ charges: 12 });
            expect(AUTOPAY_CHARGES_DEFAULT).toBe(12);
            expect(autopayCharges(c)).toBe(12);
        });

        it("takes another count the provider accepts", () => {
            const input = fixtureInput();
            input.autopay = { charges: 60 };
            expect(autopayCharges(parseCatalog(input))).toBe(60);
            input.autopay = { charges: AUTOPAY_CHARGES_MAX };
            expect(errorsOf(input)).toEqual([]);
        });

        it("refuses one charge, a part charge, or more than Razorpay takes", () => {
            for (const charges of [0, 1, 12.5, AUTOPAY_CHARGES_MAX + 1]) {
                const input = fixtureInput();
                input.autopay = { charges };
                expect(errorsOf(input).length).toBeGreaterThan(0);
            }
        });

        it("reads a draft or snapshot without it as 12", () => {
            expect(autopayCharges({})).toBe(12);
            expect(autopayCharges(null)).toBe(12);
        });
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

    it("offers an add-on on every plan unless it names some (DEC-157)", () => {
        const c = fixture();
        const [things, person, , personC] = c.addons;
        expect(c.plans.every((p) => addonOfferedOn(things, p.id))).toBe(true);
        expect(addonOfferedOn({ plans: [] }, "a")).toBe(true);
        expect(c.plans.filter((p) => addonOfferedOn(person, p.id))).toEqual([
            c.plans[1],
        ]);
        expect(addonPlanNames(c, things)).toBe("");
        expect(addonPlanNames(c, personC)).toBe("Plan C");
        expect(addonPlanNames(c, { plans: ["c", "a", "b"] })).toBe(
            "Plan A, Plan B and Plan C",
        );
        expect(addonMaxQuantity(things)).toBe(MAX_ADDON_QUANTITY);
        expect(addonMaxQuantity(person)).toBe(4);
    });

    it("rejects an add-on's unknown plan and a maximum out of range", () => {
        const withAddon = (patch: Record<string, unknown>) => {
            const input = fixtureInput();
            const addons = (input.addons ?? []) as Record<string, unknown>[];
            addons[1] = { ...addons[1], ...patch };
            return { ...input, addons };
        };
        expect(errorsOf(withAddon({ plans: ["b", "zz"] })).join()).toMatch(
            /One more person is offered on an unknown plan: zz/,
        );
        for (const max of [0, -1, MAX_ADDON_QUANTITY + 1]) {
            expect(errorsOf(withAddon({ max })).join()).toMatch(
                /One more person's maximum must be from 1 to 99/,
            );
        }
        expect(errorsOf(withAddon({ max: 1.5 })).length).toBeGreaterThan(0);
        expect(errorsOf(withAddon({ max: 1 }))).toEqual([]);
        expect(errorsOf(withAddon({ max: MAX_ADDON_QUANTITY }))).toEqual([]);
    });

    it("rejects two add-ons for the same thing on one plan", () => {
        const withAddon = (i: number, patch: Record<string, unknown>) => {
            const input = fixtureInput();
            const addons = (input.addons ?? []) as Record<string, unknown>[];
            addons[i] = { ...addons[i], ...patch };
            return { ...input, addons };
        };
        // Both name Plan C.
        expect(errorsOf(withAddon(1, { plans: ["b", "c"] })).join()).toMatch(
            /One more person and One more person on C are both offered on Plan C; a plan takes one of them/,
        );
        // One names no plan, so it is on every plan the other names.
        expect(errorsOf(withAddon(3, { plans: undefined })).join()).toMatch(
            /both offered on Plan B/,
        );
        expect(errorsOf(withAddon(3, { plans: [] })).join()).toMatch(
            /both offered on Plan B/,
        );
        // Module add-ons clash only over the same module.
        const twoModules = fixtureInput();
        twoModules.addons?.push({
            id: "roles-alone",
            kind: "module",
            module: "roles",
            name: "Roles",
            pricePaise: 4_400,
            mode: "pack",
            qty: 1,
        });
        expect(errorsOf(twoModules)).toEqual([]);
        twoModules.addons?.push({
            id: "roles-again",
            kind: "module",
            module: "roles",
            name: "Roles again",
            pricePaise: 5_500,
            mode: "pack",
            qty: 1,
            plans: ["a"],
        });
        expect(errorsOf(twoModules).join()).toMatch(
            /Roles and Roles again are both offered on Plan A/,
        );
    });

    it("still reads a snapshot written before add-ons named plans", () => {
        const input = fixtureInput();
        input.addons = input.addons?.slice(0, 1);
        const c = parseCatalog(JSON.parse(JSON.stringify(input)));
        expect(c.addons[0]).not.toHaveProperty("plans");
        expect(c.addons[0]).not.toHaveProperty("max");
    });

    it("round-trips through JSON, as a version row stores it", () => {
        const c = fixture();
        expect(catalogSchema.parse(JSON.parse(JSON.stringify(c)))).toEqual(c);
    });
});
