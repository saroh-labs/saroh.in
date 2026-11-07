import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PAY_DUE_HREF, PaymentDueBanner } from "./payment-due-banner";

const due = { planName: "Grow", dueBy: "2026-11-13T09:30:00.000Z" };

describe("PaymentDueBanner (DEC-210)", () => {
    it("says the payment failed, the method failed, the date to pay by, and Pay now", () => {
        const html = renderToStaticMarkup(<PaymentDueBanner due={due} />);
        expect(html).toContain("Your payment for Grow didn’t go");
        expect(html).toContain("The card or autopay it was paid with failed");
        expect(html).toContain("to keep Grow");
        expect(html).toContain("you move to Free, and everything you made");
        expect(html).toContain(`href="${PAY_DUE_HREF}"`);
        expect(html).toContain("Pay now");
    });

    it("shows nothing when nothing is due", () => {
        expect(renderToStaticMarkup(<PaymentDueBanner due={null} />)).toBe("");
        expect(renderToStaticMarkup(<PaymentDueBanner due={undefined} />)).toBe(
            "",
        );
    });
});
