import {
    formatInr,
    GST_PERCENT,
    monthlyEquivalentPaise,
    withGstPaise,
} from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { PRICE_PLACEHOLDER } from "@/content/types";

import { placeholderPricingModel, pricingPageModel } from "./pricing-view";
import { fakeCatalog } from "./pricing.fixture";

/** A currency sign (written as an escape: no sign in the repo) or a digit. */
const NO_PRICE = new RegExp("\\u20B9|\\d");

/** The pricing page's words, from a fake catalogue (plans catalogue U24). */
describe("pricingPageModel", () => {
    it("draws every offered plan in order, the highlighted one featured", () => {
        const { plans } = pricingPageModel(fakeCatalog()).views["month-excl"];
        expect(plans.map((p) => [p.name, p.featured])).toEqual([
            ["Plan A", false],
            ["Plan B", true],
            ["Plan C", false],
        ]);
        expect(plans[0].lead).toBe("");
        expect(plans[2].lead).toBe("Everything in Plan B, plus:");
    });

    it("monthly before GST: the price, a month, + GST; free is free for good", () => {
        const m = pricingPageModel(fakeCatalog()).views["month-excl"];
        expect(m.plans[1]).toMatchObject({
            price: formatInr(11_100),
            per: "a month",
            sub: "+ GST",
        });
        expect(m.plans[0].sub).toBe("Free for good");
        expect(m.footnote).toBe(
            `Billed monthly. Prices before GST (${GST_PERCENT}%).`,
        );
    });

    it("with GST: prices include it and the footnote says so", () => {
        const m = pricingPageModel(fakeCatalog()).views["month-incl"];
        expect(m.plans[1].price).toBe(formatInr(withGstPaise(11_100)));
        expect(m.plans[1].sub).toBe("Incl. GST");
        expect(m.footnote).toContain(`Prices include ${GST_PERCENT}% GST.`);
    });

    it("yearly: pay for the paid months, about … a month + GST", () => {
        const model = pricingPageModel(fakeCatalog());
        expect(model.yearly).toEqual({ freeMonths: 2 });
        const y = model.views["year-excl"];
        expect(y.plans[1]).toMatchObject({
            price: formatInr(111_000),
            per: "a year",
            sub: `About ${formatInr(monthlyEquivalentPaise(111_000))} a month + GST`,
        });
        // A free plan has no year to pay for.
        expect(y.plans[0].per).toBe("a month");
        expect(y.footnote).toMatch(/^Billed yearly, pay for 10 months/);
    });

    it("no yearly switch when the catalogue doesn't offer yearly", () => {
        const model = pricingPageModel(
            fakeCatalog((c) => {
                c.yearly = { on: false, paid: 10 };
            }),
        );
        expect(model.yearly).toBeNull();
        expect(model.views["year-excl"].plans[1].per).toBe("a month");
    });

    it("starts with GST shown when the catalogue says so", () => {
        const model = pricingPageModel(
            fakeCatalog((c) => {
                c.gst = { show: "incl" };
            }),
        );
        expect(model.gst).toEqual({ toggle: true, initial: true });
    });

    it("a trial: the card says so and the CTA gets its days", () => {
        const m = pricingPageModel(
            fakeCatalog((c) => {
                c.plans[1].trial = { on: true, days: 7 };
            }),
        ).views["month-excl"];
        expect(m.plans[1].trial).toBe("Try it free for 7 days");
        expect(m.plans[1].cta).toMatchObject({ plan: "grow", trialDays: 7 });
        expect(m.plans[2].trial).toBe("");
    });

    it("coming soon is marked; hidden modules are left out", () => {
        const model = pricingPageModel(fakeCatalog());
        const labels = model.rows.map((r) => r.label);
        expect(labels).toEqual([
            "Group one",
            "Website",
            "Products",
            "Group two",
            "Bookings",
            "Extra",
        ]);
        const extra = model.rows.find((r) => r.label === "Extra");
        expect(extra).toMatchObject({ kind: "line", soon: true });
        const b = model.views["month-excl"].plans[1];
        expect(b.lines.map((l) => l.t)).toContain("Extra (coming soon)");
        expect(JSON.stringify(model)).not.toContain("Secret");
    });

    it("add-ons: packs, units and modules, in words", () => {
        const { addons } = pricingPageModel(fakeCatalog()).views["month-excl"];
        expect(addons.map((a) => a.line)).toEqual([
            `+3 products for ${formatInr(11_100)} a month`,
            `Extra on a plan that doesn't include it, ${formatInr(22_200)} a month`,
        ]);
    });
});

describe("placeholderPricingModel", () => {
    it("names the plans and shows no price, limit or switch", () => {
        const model = placeholderPricingModel();
        expect(model.placeholder).toBe(true);
        expect(model.yearly).toBeNull();
        expect(model.gst.toggle).toBe(false);
        const { plans } = model.views["month-excl"];
        expect(plans.map((p) => p.name)).toEqual(["Free", "Grow", "Pro"]);
        expect(plans.every((p) => p.price === PRICE_PLACEHOLDER)).toBe(true);
        expect(JSON.stringify(model)).not.toMatch(NO_PRICE);
    });
});
