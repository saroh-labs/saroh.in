import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PaymentBanner } from "./change-panels";

/**
 * The pay-on-handover banner on Order Detail (R34): once nobody has come
 * for the order in three days it says how long, and offers Mark paid and
 * Cancel order… — never a cancel of its own. Before then it reads as usual.
 */
const render = (over: Partial<Parameters<typeof PaymentBanner>[0]> = {}) =>
    renderToStaticMarkup(
        <PaymentBanner
            failed={false}
            first="Anika"
            canRecord
            onCash={() => undefined}
            handover="collection"
            {...over}
        />,
    );

describe("the pay-on-handover banner", () => {
    it("reads as usual before anyone is waiting on it", () => {
        const html = render({ uncollectedDays: null });
        expect(html).toContain("Pay on collection");
        expect(html).not.toContain("Not collected");
        expect(html).not.toContain("Cancel order");
    });

    it("says how long it has waited, with Mark paid and Cancel order…", () => {
        const html = render({ uncollectedDays: 4, onCancel: () => undefined });
        expect(html).toContain("Not collected for 4 days");
        expect(html).toContain("Anika chose to pay when they collect it");
        expect(html).toContain("nothing cancels on its own");
        expect(html).toContain("Mark paid");
        expect(html).toContain("Cancel order…");
    });

    it("offers no cancel to someone who can't cancel it now", () => {
        const html = render({ uncollectedDays: 4 });
        expect(html).toContain("Not collected for 4 days");
        expect(html).not.toContain("Cancel order");
    });

    it("says delivered for an order that goes out", () => {
        expect(render({ handover: "delivery", uncollectedDays: 3 })).toContain(
            "Not delivered for 3 days",
        );
    });
});

describe("the pay-on-handover banner with no customer name (#837)", () => {
    it("starts its sentence with a capital", () => {
        const html = render({ first: "the customer", uncollectedDays: null });
        expect(html).toContain(
            "The customer chose to pay when they collect it.",
        );
        expect(html).not.toContain(">the customer chose");
    });

    it("starts the waited sentence with a capital too", () => {
        const html = render({ first: "the customer", uncollectedDays: 4 });
        expect(html).toContain(
            "The customer chose to pay when they collect it and",
        );
    });
});
