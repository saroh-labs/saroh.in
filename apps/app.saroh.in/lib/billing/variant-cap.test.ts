import { describe, expect, it } from "vitest";

import { createBlock, rowNotice } from "./access";
import { access, row } from "./fixtures.test-data";
import { planMeter } from "./meter";
import { variantCapNote, variantCapOf } from "./variant-cap";

/** The `variants` row as the API sends it: a cap, and never a count. */
const variants = (over: Parameters<typeof row>[0] = {}) =>
    row({
        moduleId: "variants",
        name: "Kinds",
        what: "The kinds one thing comes in.",
        limit: 22,
        text: "Up to 22 a thing",
        usage: null,
        menu: null,
        child: null,
        ...over,
    });

const on = (over: Parameters<typeof row>[0] = {}) =>
    access({ modules: [row(), variants(over)] });

describe("variantCapOf (DEC-158)", () => {
    it("reads the plan's cap and the way to more", () => {
        expect(variantCapOf(on())).toEqual({
            limit: 22,
            plan: "Plan A",
            upgradeTo: "Plan B",
            uncapped: false,
            href: "/settings/billing?plan=b#change-plan",
        });
    });

    it("is nothing where nothing caps them", () => {
        // An unread plan, a business the catalogue doesn't reach, limits
        // not enforced.
        expect(variantCapOf(null)).toBeNull();
        expect(
            variantCapOf(access({ source: "legacy", modules: [] })),
        ).toBeNull();
        expect(
            variantCapOf(access({ enforced: false, modules: [variants()] })),
        ).toBeNull();
        // A version published before the row existed.
        expect(variantCapOf(access())).toBeNull();
        // No number in the cell, or the row left out: a limit, never a lock.
        expect(variantCapOf(on({ limit: null }))).toBeNull();
        expect(variantCapOf(on({ state: "locked", limit: null }))).toBeNull();
    });

    it("is never a business-wide meter or notice", () => {
        const view = on();
        expect(planMeter(view, "variants")).toBeNull();
        expect(rowNotice(view, "variants")).toEqual({ on: false, full: false });
        expect(createBlock(view, "variants")).toBeNull();
    });
});

describe("variantCapNote (DEC-158)", () => {
    const cap = variantCapOf(on());

    it("says nothing while there is room", () => {
        expect(variantCapNote(cap, 0)).toBeNull();
        expect(variantCapNote(cap, 21)).toBeNull();
        expect(variantCapNote(null, 500)).toBeNull();
    });

    it("says the cap and the plan with more, at the cap", () => {
        expect(variantCapNote(cap, 22)).toEqual({
            text: "You can have up to 22 variants a product on Plan A. No more can be added to this one. Plan B allows more.",
            cta: "See Plan B",
            href: "/settings/billing?plan=b#change-plan",
        });
    });

    it("says a product past the cap keeps what it has", () => {
        expect(variantCapNote(cap, 33)?.text).toBe(
            "You can have up to 22 variants a product on Plan A. No more can be added to this one. It keeps the 33 it has. Plan B allows more.",
        );
    });

    it("on the top plan, asks to talk and points at the plans", () => {
        const top = variantCapOf(on({ upgradeTo: null }));
        expect(variantCapNote(top, 22)).toEqual({
            text: "You can have up to 22 variants a product on Plan A. No more can be added to this one. Talk to us if you need more.",
            cta: "See plans",
            href: "/settings/billing#change-plan",
        });
    });

    it("says a higher plan with no cap has no limit", () => {
        const open = variantCapOf(
            on({
                upgradeTo: {
                    planId: "c",
                    name: "Plan C",
                    pricePaise: 22_200,
                    uncapped: true,
                },
            }),
        );
        expect(variantCapNote(open, 22)?.text).toMatch(
            /Plan C has no limit\.$/,
        );
    });
});
