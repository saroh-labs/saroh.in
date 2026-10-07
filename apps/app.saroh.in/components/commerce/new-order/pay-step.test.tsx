import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { canHandOver } from "@/lib/orders/new-order";

import { PayStep } from "./pay-step";

/**
 * "Handed over now" (UX-059): a counter sale paid now and picked up there
 * is Collected the moment it's made, so the customer who has left doesn't
 * leave three steps behind.
 */
describe("handed over now (UX-059)", () => {
    it("applies to a pick-up paid at the counter now", () => {
        expect(canHandOver("CASH", "PICKUP")).toBe(true);
        expect(canHandOver("UPI", "PICKUP")).toBe(true);
        expect(canHandOver("CARD", "PICKUP")).toBe(true);
        expect(canHandOver("LATER", "PICKUP")).toBe(false);
        expect(canHandOver("LINK", "PICKUP")).toBe(false);
        expect(canHandOver("CASH", "LOCAL_DELIVERY")).toBe(false);
    });

    const render = (handedOver: boolean | null) =>
        renderToStaticMarkup(
            <PayStep
                options={[{ key: "CASH", label: "Cash", off: null }]}
                pay="CASH"
                onPay={() => undefined}
                given=""
                onGiven={() => undefined}
                change={{ kind: "none" }}
                total="₹100"
                note="Paid now."
                format={(c) => `₹${c / 100}`}
                discount=""
                onDiscount={() => undefined}
                handedOver={handedOver}
                onHandedOver={() => undefined}
            />,
        );

    it("is offered, on, and says what it does", () => {
        const html = render(true);
        expect(html).toContain("Handed over now");
        expect(html).toContain("It&#x27;s made Collected");
    });

    it("isn't offered where it doesn't apply", () => {
        expect(render(null)).not.toContain("Handed over now");
    });
});
