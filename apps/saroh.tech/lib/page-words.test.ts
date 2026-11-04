import { describe, expect, it } from "vitest";

import { ABOUT } from "@/content/about";
import { CONTACT } from "@/content/contact";
import { INTEGRATIONS } from "@/content/integrations";
import { PRICING } from "@/content/pricing";

const words = (o: unknown) => JSON.stringify(o);
const { noPrice: _absentMark, ...pricing } = PRICING;
const { planned, plannedTitle: _title, ...live } = INTEGRATIONS;

describe("the pricing, integrations, about and contact words", () => {
    it("say nothing untrue outside India", () => {
        expect(words([pricing, live, planned, ABOUT, CONTACT])).not.toMatch(
            /₹|\$\d|\b(GST|GSTIN|UPI|Razorpay|Cashfree|SMS|cancel|refund|merchant of record)\b/i,
        );
    });

    it("name a payment provider only on the list of what's not built", () => {
        expect(words([pricing, live, ABOUT, CONTACT])).not.toMatch(
            /\b(stripe|paypal)\b/i,
        );
        expect(planned.map((g) => g.label)).toEqual(["Decided", "Later"]);
    });

    it("give no address, handle or reply time that isn't confirmed", () => {
        expect(words([pricing, live, ABOUT, CONTACT])).not.toMatch(
            /@saroh|mailto:|working day|within \d|instagram|linkedin|Gurgaon/i,
        );
    });

    it("hold to the copy rules", () => {
        expect(words([pricing, INTEGRATIONS, ABOUT, CONTACT])).not.toMatch(
            /—|&mdash;|!|\b(please|simply|easy|oops|successfully)\b/i,
        );
    });

    it("promise email to no customer", () => {
        expect(words(INTEGRATIONS)).not.toMatch(/\bemail/i);
    });
});
