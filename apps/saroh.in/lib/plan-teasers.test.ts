import { formatInr } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { faqs } from "@/content/faq";
import { FREE_PLAN_LINE } from "@/content/home";

import { freePlanLine, startFreeFaq } from "./plan-teasers";
import { fakeCatalog } from "./pricing.fixture";

/** A currency sign (written as an escape: no sign in the repo) or a digit. */
const NO_PRICE = new RegExp("\\u20B9|\\d");

/** The plan teasers (plans catalogue U23, U24), from a fake catalogue. */
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
