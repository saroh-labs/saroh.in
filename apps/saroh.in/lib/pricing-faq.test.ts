import { formatInr, NO_REFUNDS_LINE } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { pricingQuestions } from "./pricing-faq";
import { fakeCatalog } from "./pricing.fixture";

describe("pricingQuestions", () => {
    it("asks about the launch offer only while there is one, with its figures and end date", () => {
        const none = pricingQuestions(fakeCatalog(), [], []);
        expect(none.map((i) => i.q)).not.toContain(
            "How does the launch offer work?",
        );
        const offer = pricingQuestions(
            fakeCatalog(),
            [
                {
                    planId: "grow",
                    discountPaise: 1_100,
                    months: 3,
                    endsAt: "2030-01-01T00:00:00.000Z",
                },
            ],
            [],
        );
        const a = offer.find(
            (i) => i.q === "How does the launch offer work?",
        )?.a;
        expect(a).toContain("before 1 Jan 2030");
        expect(a).toContain(
            `Plan B is ${formatInr(10_000)} + GST a month for your first 3 months, then ${formatInr(11_100)} + GST.`,
        );
    });

    it("says yearly from the catalogue, with the no-refunds line", () => {
        const items = pricingQuestions(fakeCatalog(), [], []);
        const yearly = items.find((i) => i.q === "Can I pay yearly?")?.a;
        expect(yearly).toMatch(/^Yes, on Plan B and Plan C\./);
        expect(yearly).toContain(NO_REFUNDS_LINE);
        expect(items.map((i) => i.q)).toContain("How is GST charged?");
    });

    it("leaves yearly out when the catalogue has none", () => {
        const items = pricingQuestions(
            fakeCatalog((c) => {
                c.yearly = { on: false, paid: 10 };
            }),
            [],
            [],
        );
        expect(items.map((i) => i.q)).not.toContain("Can I pay yearly?");
    });
});
