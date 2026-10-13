/**
 * Which add-ons a change of plan ends (DEC-157): the one rule the change
 * and its quote share. The made-up catalogue (`fakeCatalog`: Plan A/B/C,
 * 111, 222) — never a real plan, price or limit.
 */
import type { Catalog } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import {
    addonsEndingWith,
    addonsNotOffered,
    checkoutClearsAddons,
} from "./addons-ending";

/** Bills off Plan B, and one more person priced for Plan B and for Plan C. */
const catalog = (edit?: (c: Catalog) => void) =>
    fakeCatalog((c) => {
        c.modules[1]!.cells.b = { inc: false, off: "locked" };
        c.addons.push(
            {
                id: "person-b",
                kind: "members",
                name: "One more person",
                pricePaise: 222,
                mode: "unit",
                qty: 1,
                plans: ["b"],
                max: 2,
            },
            {
                id: "person-c",
                kind: "members",
                name: "One more person on C",
                pricePaise: 111,
                mode: "unit",
                qty: 1,
                plans: ["c"],
                max: 5,
            },
        );
        edit?.(c);
    });

const HELD = [
    { addonId: "person-b", quantity: 2 },
    { addonId: "things-pack", quantity: 1 },
    { addonId: "bills", quantity: 1 },
];

describe("addonsNotOffered", () => {
    it("is the held add-ons the plan isn't offered, and never one its version doesn't have", () => {
        const held = [...HELD, { addonId: "gone", quantity: 3 }];
        expect(addonsNotOffered(catalog(), "c", held)).toEqual([
            { addonId: "person-b", quantity: 2 },
        ]);
        expect(addonsNotOffered(catalog(), "b", held)).toEqual([]);
    });
});

describe("checkoutClearsAddons", () => {
    it("a new plan and a first trial start with none; another plan during a trial keeps them", () => {
        expect(checkoutClearsAddons("NEW", false)).toBe(true);
        expect(checkoutClearsAddons("TRIAL", false)).toBe(true);
        expect(checkoutClearsAddons("TRIAL", true)).toBe(false);
        expect(checkoutClearsAddons("UPGRADE", false)).toBe(false);
        expect(checkoutClearsAddons("SCHEDULED", false)).toBe(false);
    });
});

describe("addonsEndingWith", () => {
    const on = (planId: string, c = catalog()) => ({ catalog: c, planId });
    const to = (planId: string, c = catalog()) => ({
        catalog: c,
        planId,
        paid: planId !== "free",
    });
    const personB = {
        id: "person-b",
        name: "One more person",
        quantity: 2,
        onNewPlan: "One more person on C",
    };

    it.each(["UPGRADE", "SCHEDULED", "RENEW"] as const)(
        "%s: names what the new plan isn't offered, how many, and the new plan's own",
        (kind) => {
            expect(
                addonsEndingWith({
                    kind,
                    trialing: false,
                    held: HELD,
                    current: on("b"),
                    target: to("c"),
                }),
            ).toEqual([personB]);
        },
    );

    it("another plan while a trial runs ends the same ones", () => {
        expect(
            addonsEndingWith({
                kind: "TRIAL",
                trialing: true,
                held: HELD,
                current: on("b"),
                target: to("c"),
            }),
        ).toEqual([personB]);
    });

    it("names the same ones the change ends", () => {
        const ending = addonsEndingWith({
            kind: "UPGRADE",
            trialing: false,
            held: HELD,
            current: on("b"),
            target: to("c"),
        });
        expect(ending.map((e) => e.id)).toEqual(
            addonsNotOffered(catalog(), "c", HELD).map((h) => h.addonId),
        );
    });

    it("says nothing of the new plan when it has no add-on of the kind", () => {
        const c = catalog((x) => {
            x.addons = x.addons.filter((a) => a.id !== "person-c");
        });
        expect(
            addonsEndingWith({
                kind: "UPGRADE",
                trialing: false,
                held: HELD,
                current: on("b", c),
                target: to("c", c),
            }),
        ).toEqual([{ ...personB, onNewPlan: null }]);
    });

    it("a free plan ends every add-on, and offers none", () => {
        const ending = addonsEndingWith({
            kind: "TO_FREE",
            trialing: false,
            held: HELD,
            current: on("b"),
            target: to("free"),
        });
        expect(ending.map((e) => [e.id, e.quantity, e.onNewPlan])).toEqual([
            ["person-b", 2, null],
            ["things-pack", 1, null],
            ["bills", 1, null],
        ]);
    });

    it("a checkout that starts afresh ends every add-on; the plan's own can be added again", () => {
        // A trial that goes yearly is a new plan (`quoteChange`).
        const ending = addonsEndingWith({
            kind: "NEW",
            trialing: true,
            held: HELD,
            current: on("b"),
            target: to("b"),
        });
        expect(ending.map((e) => [e.id, e.onNewPlan])).toEqual([
            ["person-b", "One more person"],
            ["things-pack", "More things"],
            ["bills", "Bills on their own"],
        ]);
    });

    it("names only what counts today", () => {
        const held = [
            // Another plan's, held and inert.
            { addonId: "person-c", quantity: 1 },
            { addonId: "person-b", quantity: 0 },
            { addonId: "gone", quantity: 4 },
        ];
        expect(
            addonsEndingWith({
                kind: "TO_FREE",
                trialing: false,
                held,
                current: on("b"),
                target: to("free"),
            }),
        ).toEqual([]);
    });

    it("is nothing with no change, no add-on held, or a plan that can't be read", () => {
        const base = {
            trialing: false,
            held: HELD,
            current: on("b"),
            target: to("c"),
        };
        expect(addonsEndingWith({ ...base, kind: "NONE" })).toEqual([]);
        expect(
            addonsEndingWith({ ...base, kind: "UPGRADE", held: [] }),
        ).toEqual([]);
        expect(
            addonsEndingWith({ ...base, kind: "UPGRADE", current: null }),
        ).toEqual([]);
        // As the change itself: a version that can't be read ends nothing.
        expect(
            addonsEndingWith({ ...base, kind: "UPGRADE", target: null }),
        ).toEqual([]);
    });
});
