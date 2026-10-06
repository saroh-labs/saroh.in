import { describe, expect, it } from "vitest";

import { HERO_KINDS, WAITLIST, WAITLIST_KINDS } from "@/content/waitlist";

import {
    openingDay,
    openingLong,
    openingShort,
    referralLink,
    WAITLIST_MESSAGES,
    waitlistContext,
    waitlistSchema,
} from "./waitlist";

/** The waitlist page's rules (plan U30). Dates and ids here are made up. */
describe("waitlistContext", () => {
    it("is direct with no plan or referral when the query names none", () => {
        expect(waitlistContext({})).toEqual({
            plan: undefined,
            src: "direct",
            ref: undefined,
        });
    });

    it("keeps the CTA builder's plan and source", () => {
        expect(waitlistContext({ plan: "grow", src: "pricing-grow" })).toEqual({
            plan: "grow",
            src: "pricing-grow",
            ref: undefined,
        });
        expect(waitlistContext({ src: "Instagram" }).src).toBe("instagram");
    });

    it("drops a plan it does not know and cleans a source", () => {
        const context = waitlistContext({
            plan: "enterprise",
            src: "<b>x</b>",
        });
        expect(context.plan).toBeUndefined();
        expect(context.src).toBe("bxb");
    });

    it("takes a referral id only when it looks like one", () => {
        expect(waitlistContext({ ref: "abcdefgh" }).ref).toBe("abcdefgh");
        expect(waitlistContext({ ref: "glow-studio" }).ref).toBeUndefined();
        expect(waitlistContext({ ref: ["abcdefgh", "x"] }).ref).toBe(
            "abcdefgh",
        );
    });

    it("keeps a template only when it is one of the gallery's (U13)", () => {
        const known = ["gym", "bakery"];
        expect(waitlistContext({ template: "gym" }, known).template).toBe(
            "gym",
        );
        expect(waitlistContext({ template: " Gym " }, known).template).toBe(
            "gym",
        );
        expect(
            waitlistContext({ template: "salon" }, known).template,
        ).toBeUndefined();
        expect(
            waitlistContext({ template: "<script>" }, known).template,
        ).toBeUndefined();
        // No list, no template: the form never sends one it can't name.
        expect(waitlistContext({ template: "gym" }).template).toBeUndefined();
    });
});

describe("waitlistSchema", () => {
    const ok = {
        business: "Glow Studio",
        kind: "salon",
        email: "you@glowstudio.in",
        city: "",
    };

    it("takes a filled form, with city left empty", () => {
        expect(waitlistSchema.safeParse(ok).success).toBe(true);
    });

    it("refuses each missing field with the design's words", () => {
        const result = waitlistSchema.safeParse({
            business: "  ",
            kind: "",
            email: "name@shop",
            city: "",
        });
        expect(result.success).toBe(false);
        const messages = result.error?.flatten().fieldErrors;
        expect(messages?.business).toEqual([WAITLIST_MESSAGES.business]);
        expect(messages?.kind).toEqual([WAITLIST_MESSAGES.kind]);
        expect(messages?.email).toEqual([WAITLIST_MESSAGES.email]);
        expect(messages?.city).toBeUndefined();
    });
});

describe("opening dates", () => {
    it("reads as the design writes them, in India's date", () => {
        expect(openingShort("2030-03-05")).toBe("Tue 5 Mar");
        expect(openingLong("2030-03-05")).toBe("Tuesday 5 March");
        expect(openingDay("2030-03-05")).toBe("5 Mar");
    });
});

describe("referralLink", () => {
    it("copies the full address and shows it without scheme or www", () => {
        expect(referralLink("https://www.saroh.in", "abcdefgh")).toEqual({
            href: "https://www.saroh.in/waitlist?ref=abcdefgh",
            shown: "saroh.in/waitlist?ref=abcdefgh",
        });
    });
});

describe("the waitlist content", () => {
    it("asks about the design's eight kinds and shows seven in the hero", () => {
        expect(WAITLIST_KINDS.map((k) => k.label)).toEqual([
            "Salon or beauty",
            "Gym or studio",
            "Clinic",
            "Dietician or coach",
            "Bakery or food",
            "Shop",
            "Creator",
            "Something else",
        ]);
        expect(HERO_KINDS).toHaveLength(7);
    });

    /** The repo is public: no price, plan length or date until announced. */
    it("carries no price, offer or date while they are unannounced", () => {
        const everything = JSON.stringify(WAITLIST);
        expect(everything).not.toMatch(/\u20B9|Rs\.?\s?\d|INR/);
        expect(everything).not.toMatch(/\d/);
        expect(WAITLIST.offer).toBeNull();
        expect(WAITLIST.openingDate).toBeNull();
    });
});
