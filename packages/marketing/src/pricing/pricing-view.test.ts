import { parseCatalog } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import type { PricingSite } from "./pricing-model";
import { placeholderPricingModel, pricingPageModel } from "./pricing-view";

// Made up on purpose: no real plan, price or limit (the repo is public).
const catalog = () =>
    parseCatalog({
        plans: [
            { id: "a", name: "Plan A", pricePaise: 0, tagline: "" },
            {
                id: "b",
                name: "Plan B",
                pricePaise: 11_100,
                tagline: "",
                featured: true,
            },
        ],
        groups: [{ id: "one", name: "One" }],
        modules: [
            {
                id: "products",
                name: "Products",
                group: "one",
                cells: {
                    a: { inc: true, text: "Few", card: "Few" },
                    b: { inc: true, text: "More", card: "More", limit: 2000 },
                },
            },
        ],
        yearly: { on: true, paid: 10 },
        gst: { show: "incl" },
        addons: [
            {
                id: "pack",
                kind: "products",
                name: "Pack",
                pricePaise: 100,
                mode: "pack",
                qty: 5,
            },
        ],
    });

const NO_TAX: PricingSite = {
    money: (m) => `XX${m}`,
    count: (n) => `#${n}`,
    tax: null,
};

const WITH_TAX: PricingSite = {
    ...NO_TAX,
    tax: {
        add: (m) => m * 2,
        subExcl: "before LEVY",
        subIncl: "with LEVY",
        afterExcl: " before LEVY",
        afterIncl: " with LEVY",
        footnoteExcl: "Foot before.",
        footnoteIncl: "Foot with.",
        noteExcl: "Note before.",
        noteIncl: "Note with.",
    },
};

const RUPEE_OR_GST = new RegExp("\\u20B9|GST|Inr|paise", "i");

describe("pricingPageModel", () => {
    it("money, numbers and tax words are all the site's", () => {
        const model = pricingPageModel(catalog(), WITH_TAX);
        expect(model.tax).toEqual({ toggle: true, initial: true });
        const incl = model.views["month-incl"];
        expect(incl.plans[1]?.price).toBe("XX22200");
        expect(incl.plans[1]?.sub).toBe("with LEVY");
        expect(incl.footnote).toBe("Billed monthly. Foot with.");
        expect(incl.usage?.notes.at(-1)).toBe("Note with.");
        const excl = model.views["year-excl"];
        expect(excl.plans[1]?.sub).toContain("a month before LEVY");
        const row = incl.usage?.rows.find((r) => r.kind === "line");
        expect(row?.kind === "line" && row.cells[1]).toContain("#2000");
        expect(JSON.stringify(model)).not.toMatch(RUPEE_OR_GST);
    });

    it("a site with no tax: no toggle, no tax words, one sum either way", () => {
        const model = pricingPageModel(catalog(), NO_TAX);
        expect(model.tax).toEqual({ toggle: false, initial: false });
        expect(model.views["month-incl"]).toEqual(model.views["month-excl"]);
        expect(model.views["month-excl"].plans[1]?.sub).toBe("");
        expect(model.views["month-excl"].footnote).toBe("Billed monthly.");
        expect(model.views["year-excl"].plans[1]?.sub).toMatch(/a month$/);
        expect(JSON.stringify(model)).not.toMatch(RUPEE_OR_GST);
    });
});

describe("placeholderPricingModel", () => {
    it("draws the site's plan names with no amounts, tables or toggles", () => {
        const model = placeholderPricingModel({
            plans: [
                { plan: "a", name: "Plan A", featured: false },
                { plan: "b", name: "Plan B", featured: true },
            ],
            price: "-",
            note: "Soon",
            details: "Details soon",
        });
        expect(model.placeholder).toBe(true);
        expect(model.tax.toggle).toBe(false);
        expect(model.yearly).toBeNull();
        const { plans, usage } = model.views["month-excl"];
        expect(plans.map((p) => p.price)).toEqual(["-", "-"]);
        expect(usage).toBeNull();
        expect(JSON.stringify(model)).not.toMatch(/\d/);
    });
});

describe("pricingPageModel with an automatic discount", () => {
    const TAXED: PricingSite = {
        ...NO_TAX,
        tax: {
            add: (m) => m * 2,
            subExcl: "",
            subIncl: "",
            afterExcl: " + T",
            afterIncl: " incl. T",
            footnoteExcl: "",
            footnoteIncl: "",
            noteExcl: "",
            noteIncl: "",
        },
    };
    const offers = [{ planId: "b", discountPaise: 300, months: 3 }];

    it("says each month's discount and its months in place of the trial, taxed as the view is", () => {
        const c = catalog();
        c.plans[1].trial = { on: true, days: 30, firstPaise: 700 };
        const model = pricingPageModel(c, TAXED, [], offers);
        expect(model.views["month-excl"].plans[1].trial).toBe(
            "XX300 + T off a month for your first 3 months",
        );
        expect(model.views["month-incl"].plans[1].trial).toBe(
            "XX600 incl. T off a month for your first 3 months",
        );
        // Yearly: the months' worth off the one charge.
        expect(model.views["year-excl"].plans[1].trial).toBe(
            "XX900 + T off your first year",
        );
        // A free plan never carries one.
        expect(model.views["month-excl"].plans[0].trial).toBe("");
    });

    it("one month reads as the first month; no offer keeps the plain card", () => {
        const one = pricingPageModel(
            catalog(),
            NO_TAX,
            [],
            [{ planId: "b", discountPaise: 300, months: 1 }],
        );
        expect(one.views["month-excl"].plans[1].trial).toBe(
            "XX300 off your first month",
        );
        const none = pricingPageModel(catalog(), NO_TAX);
        expect(none.views["month-excl"].plans[1].trial).toBe("");
    });

    it("a percent says its percent on a month, with or without tax; on a year, the amount checkout takes", () => {
        const pct = [
            { planId: "b", discountPaise: 300, months: 3, percentOff: 7 },
        ];
        const model = pricingPageModel(catalog(), TAXED, [], pct);
        expect(model.views["month-excl"].plans[1].trial).toBe(
            "7% off your first 3 months",
        );
        expect(model.views["month-incl"].plans[1].trial).toBe(
            "7% off your first 3 months",
        );
        expect(model.views["year-excl"].plans[1].trial).toBe(
            "XX900 + T off your first year",
        );
        const one = pricingPageModel(
            catalog(),
            NO_TAX,
            [],
            [{ ...pct[0], months: 1 }],
        );
        expect(one.views["month-excl"].plans[1].trial).toBe(
            "7% off your first month",
        );
    });
});
