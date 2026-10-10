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

/**
 * A storefront Manager without the payment permission (DEC-106): their
 * storefront role moves orders, never money, so the banner shows Paid in
 * cash disabled with why — the same words the API refuses with.
 */
describe("the banner for someone who can't record payments (DEC-106)", () => {
    it("shows Paid in cash disabled, described by the reason", () => {
        const html = render({ handover: undefined, canRecord: false });
        expect(html).toContain(
            "Your role can&#x27;t record payments — ask the owner or an admin to mark it paid.",
        );
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby=/);
        expect(html).toContain("Paid in cash");
    });
});

/**
 * An online payment that is waiting for the provider, or wasn't finished
 * (#122): the banner says which in words, and offers a pay link only where
 * there is something to act on.
 */
describe("the banner for an online payment (#122)", () => {
    const unpaid = { handover: undefined } as const;

    it("waiting: says so calmly, as a status, with no pay link", () => {
        const html = render({
            ...unpaid,
            online: {
                word: "Waiting for Razorpay",
                detail: "The customer started paying.",
                tone: "wait",
            },
            onSendLink: () => undefined,
        });
        expect(html).toContain("Waiting for Razorpay");
        expect(html).toContain("The customer started paying.");
        expect(html).toContain('role="status"');
        expect(html).not.toContain("Send a pay link");
    });

    it("not finished: says so, and offers a pay link", () => {
        const html = render({
            ...unpaid,
            online: {
                word: "Payment not finished",
                detail: "Nothing was taken.",
                tone: "act",
            },
            onSendLink: () => undefined,
        });
        expect(html).toContain("Payment not finished");
        expect(html).toContain('role="alert"');
        expect(html).toContain("Send a pay link");
    });

    it("failed keeps its own words", () => {
        const html = render({
            ...unpaid,
            failed: true,
            online: {
                word: "Payment failed",
                detail: "Razorpay said no.",
                tone: "act",
            },
            onSendLink: () => undefined,
        });
        expect(html).toContain("Payment didn&#x27;t go through");
        expect(html).toContain("Send a pay link");
    });
});
