import { exampleFor } from "@saroh/marketing/world";
import { describe, expect, it } from "vitest";

import { WORLD } from "@/content/world";

/** saroh.tech's world is the Global seed's businesses, in Global's words. */
describe("the Global example world (DEC-221)", () => {
    const words = JSON.stringify(WORLD);

    it("says nothing India-only: no rupees, GST, UPI, Razorpay or Hinglish", () => {
        expect(words).not.toMatch(
            /₹|\bGST\b|\bUPI\b|Razorpay|Hinglish|Hindi|\+91|GSTIN/,
        );
    });

    it("never claims a paid plan: Free only (DEC-211)", () => {
        expect(words).not.toMatch(/\b(Grow|Pro)\b/);
        for (const b of [WORLD.lead, ...WORLD.others])
            expect(b.plan).toBe("Free");
    });

    it("leads with the seed's bakery, which the Global shots are taken on, paid through Stripe", () => {
        expect(WORLD.lead.name).toBe("Thistlewick Bakery");
        expect(WORLD.lead.site).toBe("thistlewick-bakery.saroh.app");
        expect(WORLD.money.provider).toBe("Stripe");
    });

    it("follows ?trade= for every trade, the florist drawn only (owner, 16 Nov 2026)", () => {
        expect(exampleFor(WORLD, "salon").name).toBe("Larkspur & Vane");
        expect(exampleFor(WORLD, "gym").name).toBe("Ironvale Fitness");
        expect(exampleFor(WORLD, "florist").name).toBe("Bramble & Bloom");
    });
});
