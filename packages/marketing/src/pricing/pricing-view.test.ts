import {
    NO_REFUNDS_LINE as NO_REFUNDS,
    parseCatalog,
} from "@saroh/pricing-catalog";
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
        expect(incl.plans[1]?.per).toBe("a month with LEVY");
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

describe("a plan's yearly offer price (DEC-239)", () => {
    const offered = () => {
        const c = catalog();
        c.plans[1].yearlyOfferPaise = 77_700;
        return c;
    };
    const launch = [{ planId: "b", discountPaise: 300, months: 3 }];

    it("leads with the offer, the regular year struck, its month from the offer", () => {
        const y = pricingPageModel(offered(), NO_TAX).views["year-excl"];
        expect(y.plans[1]).toMatchObject({
            price: "XX77700",
            was: "XX111000",
            per: "a year, paid once",
            sub: "About XX6475 a month",
        });
        expect(y.plans[0].was).toBeUndefined();
        expect(y.footnote).toBe(
            `Billed yearly, one payment for the year. ${NO_REFUNDS}`,
        );
        // Monthly is untouched.
        const m = pricingPageModel(offered(), NO_TAX).views["month-excl"];
        expect(m.plans[1]).toMatchObject({ price: "XX11100", per: "a month" });
        expect(m.plans[1].was).toBeUndefined();
        expect(m.footnote).toBe("Billed monthly.");
    });

    it("never stacks the launch offer on it; without one, a year still gets it", () => {
        const withOffer = pricingPageModel(offered(), NO_TAX, [], launch);
        expect(withOffer.views["year-excl"].plans[1].trial).toBe("");
        expect(withOffer.views["month-excl"].plans[1].trial).not.toBe("");
        const plain = pricingPageModel(catalog(), NO_TAX, [], launch);
        expect(plain.views["year-excl"].plans[1].trial).toBe(
            "XX900 off your first year",
        );
        expect(plain.views["year-excl"].plans[1].was).toBeUndefined();
        expect(plain.views["year-excl"].footnote).toBe(
            `Billed yearly, pay for 10 months and get 12. ${NO_REFUNDS}`,
        );
    });
});

describe("the launch offer leads the card (the 22 Nov boards)", () => {
    const pct = [
        {
            planId: "b",
            discountPaise: 300,
            months: 3,
            percentOff: 7,
            endsAt: "2030-01-01T00:00:00.000Z",
        },
    ];
    const site: PricingSite = {
        ...NO_TAX,
        date: () => "THE DAY",
        paidNote: (_c, yearly) => (yearly ? "YEAR NOTE" : "MONTH NOTE"),
    };

    it("leads with the offer price, the regular one struck, and says what comes after", () => {
        const m = pricingPageModel(catalog(), site, [], pct);
        const card = m.views["month-excl"].plans[1];
        expect(card).toMatchObject({
            price: "XX10800",
            was: "XX11100",
            tag: "Launch offer",
            then: "then XX11100 a month",
            note: "MONTH NOTE",
        });
        expect(m.views["month-excl"].plans[0].note).toBeUndefined();
        expect(m.views["month-excl"].notice).toEqual({
            title: "Launch offer · ends THE DAY",
            body: "7% off every paid plan, your first 3 months. No code.",
        });
        // A year keeps its price and says the offer as a line.
        expect(m.views["year-excl"].plans[1]).toMatchObject({
            price: "XX111000",
            was: undefined,
            note: "YEAR NOTE",
        });
        expect(m.views["year-excl"].notice).toBeNull();
    });

    it("no offer, no tag, no notice", () => {
        const m = pricingPageModel(catalog(), site);
        expect(m.views["month-excl"].plans[1].tag).toBeUndefined();
        expect(m.views["month-excl"].plans[1].then).toBeUndefined();
        expect(m.views["month-excl"].notice).toBeNull();
    });

    it("a yearly offer is tagged and says its saving against paying monthly", () => {
        const c = catalog();
        c.plans[1].yearlyOfferPaise = 66_600;
        const y = pricingPageModel(c, site, [], pct).views["year-excl"];
        expect(y.plans[1]).toMatchObject({
            tag: "Yearly offer",
            then: "Save XX66600 (50%) against paying monthly",
        });
        expect(y.notice?.title).toBe("Yearly offer · Plan B");
    });
});
