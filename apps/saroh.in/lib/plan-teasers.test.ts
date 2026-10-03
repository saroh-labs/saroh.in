import { formatInr } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { faqs } from "@/content/faq";
import { FREE_PLAN_LINE } from "@/content/home";
import { solutions } from "@/content/solutions";
import {
    PLAN_DETAILS_PLACEHOLDER,
    PRICE_NOTE,
    PRICE_PLACEHOLDER,
} from "@/content/types";

import {
    freePlanLine,
    homePlanTeasers,
    planTeaser,
    planTeaserFootnote,
    sentenceList,
    solutionPlanTeasers,
    startFreeFaq,
} from "./plan-teasers";
import { fakeCatalog } from "./pricing.fixture";

/** A currency sign (written as an escape: no sign in the repo) or a digit. */
const NO_PRICE = new RegExp("\\u20B9|\\d");

/** The plan teasers (plans catalogue U23, U24), from a fake catalogue. */
describe("solutionPlanTeasers", () => {
    it("gyms: Grow featured with the fit line, then Free", () => {
        const [first, second] = solutionPlanTeasers(
            fakeCatalog(),
            solutions.gyms.pricing,
        );
        expect(first).toMatchObject({
            plan: "grow",
            name: "Plan B",
            price: formatInr(11_100),
            priceNote: "a month",
            featured: true,
            fit: solutions.gyms.pricing.fit,
            what: "Everything in Plan A, plus thing one plus, more items, visits and extra (coming soon).",
        });
        expect(second).toMatchObject({
            plan: "free",
            name: "Plan A",
            featured: false,
            paid: false,
            what: "Thing one, few items and some visits.",
        });
        expect(second.fit).toBeUndefined();
    });

    it.each(["shops", "clinics"] as const)("%s shows Pro second", (slug) => {
        const [, second] = solutionPlanTeasers(
            fakeCatalog(),
            solutions[slug].pricing,
        );
        expect(second.name).toBe("Plan C");
    });

    it("without a catalogue: the placeholder, never a price", () => {
        for (const s of Object.values(solutions)) {
            for (const t of solutionPlanTeasers(null, s.pricing)) {
                expect(t.price).toBe(PRICE_PLACEHOLDER);
                expect(t.priceNote).toBe(PRICE_NOTE);
                expect(t.what).toBe(PLAN_DETAILS_PLACEHOLDER);
                expect(JSON.stringify(t)).not.toMatch(NO_PRICE);
            }
        }
        expect(planTeaserFootnote(null)).toBeNull();
    });

    it("a plan the catalogue doesn't offer gets the placeholder card", () => {
        const t = planTeaser(
            fakeCatalog((c) => {
                c.plans[2].retired = true;
            }),
            "pro",
        );
        expect(t).toMatchObject({ name: "Pro", price: PRICE_PLACEHOLDER });
    });

    it("the footnote qualifies real prices", () => {
        expect(planTeaserFootnote(fakeCatalog())).toBe(
            "Billed monthly. Prices before GST.",
        );
    });
});

describe("homePlanTeasers", () => {
    it("every offered plan, in catalogue order, the highlighted one featured", () => {
        expect(
            homePlanTeasers(fakeCatalog()).map((t) => [t.name, t.featured]),
        ).toEqual([
            ["Plan A", false],
            ["Plan B", true],
            ["Plan C", false],
        ]);
        expect(homePlanTeasers(null).map((t) => t.price)).toEqual([
            PRICE_PLACEHOLDER,
            PRICE_PLACEHOLDER,
            PRICE_PLACEHOLDER,
        ]);
    });
});

describe("freePlanLine", () => {
    it("names the free plan's own lines for the chosen modules", () => {
        expect(freePlanLine(fakeCatalog())).toBe(
            `Free to start: thing one, few items and some visits. ${FREE_PLAN_LINE.tail}`,
        );
    });

    it("falls back to the placeholder line", () => {
        expect(freePlanLine(null)).toBe(FREE_PLAN_LINE.fallback);
        expect(FREE_PLAN_LINE.fallback).not.toMatch(NO_PRICE);
    });
});

describe("startFreeFaq", () => {
    it("words the answer from the free and the first paid plan", () => {
        expect(startFreeFaq(fakeCatalog(), faqs["start-free"])).toEqual({
            q: faqs["start-free"].q,
            a: `The Plan A plan is ${formatInr(0)} a month: thing one, few items and some visits. Move to Plan B (${formatInr(11_100)} a month) when you need more.`,
        });
    });

    it("keeps the content's answer, with no figures, without a catalogue", () => {
        const item = startFreeFaq(null, faqs["start-free"]);
        expect(item).toBe(faqs["start-free"]);
        expect(item.a).not.toMatch(NO_PRICE);
    });
});

describe("sentenceList", () => {
    it("joins with commas and a final and", () => {
        expect(sentenceList([])).toBe("");
        expect(sentenceList(["a"])).toBe("a");
        expect(sentenceList(["a", "b", "c"])).toBe("a, b and c");
    });
});
