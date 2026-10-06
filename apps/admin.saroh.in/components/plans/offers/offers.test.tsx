import { describe, expect, it } from "vitest";

import { fakeCatalog, fakePricing } from "@/test/pricing-fixture";

import {
    blankCoupon,
    checkCoupon,
    couponChanges,
    refusedField,
} from "./coupons";
import { paiseToRupees, rupeesToPaise } from "./money";
import {
    addonProspects,
    addonSummary,
    canAddKind,
    gstExample,
    modulesSomePlanLacks,
    newAddon,
    newAddonId,
    paidPlans,
    yearlyLines,
} from "./offers";

describe("money", () => {
    it("reads rupees as text, never through floating point", () => {
        expect(rupeesToPaise("12.10")).toBe(1210);
        expect(rupeesToPaise("12.5")).toBe(1250);
        expect(rupeesToPaise("1,110")).toBe(111_000);
        expect(rupeesToPaise("abc")).toBeNull();
        expect(rupeesToPaise("1.234")).toBeNull();
        expect(paiseToRupees(111_000)).toBe("1110");
        expect(paiseToRupees(1205)).toBe("12.05");
    });
});

describe("offers", () => {
    it("words yearly lines and the GST example from the catalogue's own prices", () => {
        const c = fakeCatalog();
        c.yearly = { on: true, paid: 10 };
        const lines = yearlyLines(c);
        expect(lines).toHaveLength(2);
        expect(lines[0]).toMatch(/^Plan B: .+ a year, about .+ a month$/);
        expect(gstExample(c)).toMatch(
            /^Plan B shows .+ \+ GST, or .+ incl\. GST \(18%\)$/,
        );
        c.gst = { show: "incl" };
        expect(gstExample(c)).toMatch(/incl\. GST, or .+ \+ GST/);
    });

    it("offers trials and yearly lines only on plans that cost something", () => {
        expect(paidPlans(fakeCatalog()).map((p) => p.id)).toEqual(["b", "c"]);
    });

    it("adds a limit add-on only for a module the catalogue has, at no price", () => {
        const c = fakeCatalog();
        expect(canAddKind(c, "products")).toBe(true);
        expect(canAddKind(c, "members")).toBe(false);
        const a = newAddon(c, "products", "a1");
        expect(a).toMatchObject({
            kind: "products",
            pricePaise: 0,
            qty: 1,
            mode: "pack",
        });
        expect(newAddon(c, "members", "a2")).toBeNull();
    });

    it("sells a module alone only when some plan lacks it", () => {
        const c = fakeCatalog();
        expect(canAddKind(c, "module")).toBe(false);
        c.modules = c.modules.map((m) => ({
            ...m,
            cells: { ...m.cells, a: { inc: false, off: "locked" } },
        }));
        expect(modulesSomePlanLacks(c).map((m) => m.id)).toEqual(["products"]);
        expect(newAddon(c, "module", "a1")).toMatchObject({
            module: "products",
            name: "Things",
        });
    });

    it("words an add-on as the design does", () => {
        const c = fakeCatalog();
        const pack = {
            id: "a1",
            kind: "products" as const,
            name: "x",
            pricePaise: 11_100,
            mode: "pack" as const,
            qty: 3,
        };
        expect(addonSummary(pack, c)).toMatch(/^\+3 products for .+ a month$/);
        expect(addonSummary({ ...pack, mode: "unit" }, c)).toMatch(
            / a month per product$/,
        );
    });

    it("counts businesses near a limit an add-on raises", () => {
        const c = fakeCatalog();
        const pricing = fakePricing({
            plans: [
                {
                    planId: "b",
                    name: "Plan B",
                    retired: false,
                    businesses: 5,
                    olderVersion: 0,
                },
            ],
            usage: {
                b: [
                    {
                        moduleId: "products",
                        businesses: 5,
                        measured: true,
                        using: 5,
                        highest: 1,
                        over: 1,
                        near: 2,
                        values: null,
                        line: null,
                    },
                ],
            },
        });
        const a = {
            id: "a1",
            kind: "products" as const,
            name: "x",
            pricePaise: 1,
            mode: "pack" as const,
            qty: 1,
        };
        expect(addonProspects(a, c, pricing)).toBe(
            "3 businesses near their limit could use it",
        );
    });

    it("never reuses an add-on id", () => {
        const c = fakeCatalog();
        c.addons = [
            {
                id: `a${(1000).toString(36)}`,
                kind: "products",
                name: "x",
                pricePaise: 1,
                mode: "pack",
                qty: 1,
            },
        ];
        expect(newAddonId(c, 1000)).toBe(`a${(1001).toString(36)}`);
    });
});

describe("coupons", () => {
    const plans = paidPlans(fakeCatalog());
    const now = new Date("2026-10-03T00:00:00.000Z");

    it("checks a new coupon the way the API would", () => {
        const form = {
            ...blankCoupon(plans),
            code: "ab",
            off: "1",
            maxUses: "5",
        };
        expect(
            checkCoupon(form, { isNew: true, plans, now }).errors.code,
        ).toBeTruthy();
        const ok = checkCoupon(
            { ...form, code: "launch-1" },
            { isNew: true, plans, now },
        );
        expect(ok.input).toMatchObject({
            code: "LAUNCH-1",
            discountPaise: 100,
            months: 1,
            maxRedemptions: 5,
            planIds: ["b", "c"],
        });
    });

    it("caps the discount at the price of each plan it names", () => {
        const form = {
            ...blankCoupon(plans),
            code: "BIG",
            off: "200",
            maxUses: "5",
        };
        const r = checkCoupon(form, { isNew: true, plans, now });
        expect(r.input).toBeNull();
        expect(r.errors.discountPaise).toBe(
            "The discount is more than Plan B costs a month.",
        );
    });

    it("refuses fewer uses than already made, and a past expiry only when it changed", () => {
        const coupon = {
            id: "c1",
            code: "OLD",
            discountPaise: 100,
            months: 1,
            planIds: ["b"],
            razorpayOfferId: null,
            active: true,
            maxRedemptions: 5,
            expiresAt: "2026-09-01T00:00:00.000Z",
            uses: 3,
            createdAt: "",
            updatedAt: "",
        };
        const form = {
            code: "OLD",
            off: "1",
            months: "1",
            planIds: ["b"],
            maxUses: "2",
            expires: new Date(coupon.expiresAt),
            offerId: "",
        };
        const r = checkCoupon(form, {
            isNew: false,
            plans,
            now,
            savedExpiresAt: coupon.expiresAt,
            uses: 3,
        });
        expect(r.errors.maxRedemptions).toMatch(/3 businesses/);
        expect(r.errors.expiresAt).toBeUndefined();
        const ok = checkCoupon(
            { ...form, maxUses: "9" },
            {
                isNew: false,
                plans,
                now,
                savedExpiresAt: coupon.expiresAt,
                uses: 3,
            },
        );
        if (!ok.input) throw new Error("Expected a valid coupon");
        expect(couponChanges(coupon, ok.input)).toEqual({ maxRedemptions: 9 });
    });

    it("takes a Razorpay offer id in Razorpay's shape, or none", () => {
        const form = {
            ...blankCoupon(plans),
            code: "OFFER-1",
            off: "1",
            maxUses: "5",
        };
        const none = checkCoupon(form, { isNew: true, plans, now });
        expect(none.input?.razorpayOfferId).toBeNull();
        const linked = checkCoupon(
            { ...form, offerId: " offer_ABCDEFGHIJKLMN " },
            { isNew: true, plans, now },
        );
        expect(linked.input?.razorpayOfferId).toBe("offer_ABCDEFGHIJKLMN");
        for (const bad of [
            "offer_ABCDEFGHIJKLM",
            "offer_ABCDEFGHIJKLMNO",
            "plan_ABCDEFGHIJKLMNO",
        ]) {
            const r = checkCoupon(
                { ...form, offerId: bad },
                { isNew: true, plans, now },
            );
            expect(r.input).toBeNull();
            expect(r.errors.razorpayOfferId).toMatch(/offer_ and 14/);
        }
    });

    it("sends a changed or cleared Razorpay offer id, and nothing when it stays", () => {
        const coupon = {
            id: "c1",
            code: "OLD",
            discountPaise: 100,
            months: 1,
            planIds: ["b"],
            razorpayOfferId: "offer_ABCDEFGHIJKLMN",
            active: true,
            maxRedemptions: 5,
            expiresAt: null,
            uses: 0,
            createdAt: "",
            updatedAt: "",
        };
        const input = {
            code: "OLD",
            discountPaise: 100,
            months: 1,
            planIds: ["b"],
            maxRedemptions: 5,
            expiresAt: null,
        };
        expect(
            couponChanges(coupon, {
                ...input,
                razorpayOfferId: "offer_ABCDEFGHIJKLMN",
            }),
        ).toEqual({});
        expect(
            couponChanges(coupon, {
                ...input,
                razorpayOfferId: "offer_NOPQRSTUVWXYZ1",
            }),
        ).toEqual({ razorpayOfferId: "offer_NOPQRSTUVWXYZ1" });
        expect(
            couponChanges(coupon, { ...input, razorpayOfferId: null }),
        ).toEqual({ razorpayOfferId: null });
    });

    it("reads the field a refusal names", () => {
        expect(refusedField({ field: "razorpayOfferId" })).toBe(
            "razorpayOfferId",
        );
        expect(refusedField({ field: "code" })).toBe("code");
        expect(refusedField({ field: "nope" })).toBeNull();
        expect(refusedField(["Validation failed"])).toBeNull();
    });
});
