import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { kitchenPayment } from "@/lib/orders/pay-on-handover";
import type { OrderRead } from "@/lib/orders/read";

import { PaymentBanner } from "./change-panels";
import { KitchenPaymentCard } from "./kitchen-payment-card";

/**
 * The counter's view of whether an order is paid (UX-010): a role with
 * `order:stage` and no money read sees the state, never a figure, and an
 * unpaid pay-on-collection order says it can't be collected until the
 * payment is recorded — and who records it.
 */
const order = (over: Partial<OrderRead> = {}): OrderRead =>
    ({
        status: "PROCESSING",
        paymentStatus: "UNPAID",
        fulfilmentType: "PICKUP",
        refundStanding: "NONE",
        payOnHandover: true,
        money: null,
        ...over,
    }) as OrderRead;

describe("whether it is paid, for the kitchen (UX-010)", () => {
    it("says Paid with no figure", () => {
        expect(kitchenPayment(order({ paymentStatus: "PAID" }))).toEqual({
            label: "Paid",
            tone: "ready",
            body: null,
        });
    });

    it("says an unpaid pick-up waits for the payment before Collected", () => {
        const s = kitchenPayment(order());
        expect(s?.label).toBe("To pay on collection");
        expect(s?.body).toContain(
            "marked collected once the payment is recorded",
        );
    });

    it("says Not paid yet for an order paid before it starts", () => {
        expect(
            kitchenPayment(order({ payOnHandover: false, stage: "NEW" }))
                ?.label,
        ).toBe("Not paid yet");
    });

    it("says nothing for a cancelled order", () => {
        expect(kitchenPayment(order({ status: "CANCELLED" }))).toBeNull();
    });

    it("tells someone who can't record payments whom to ask", () => {
        const html = renderToStaticMarkup(
            <KitchenPaymentCard order={order()} canRecord={false} />,
        );
        expect(html).toContain("To pay on collection");
        expect(html).toContain("ask the owner or an admin to mark it paid");
        expect(html).not.toContain("₹");
    });
});

describe("the pay-on-collection banner for the counter (UX-010)", () => {
    it("shows Mark paid disabled, and says why and whom to ask (FB-1, DEC-098)", () => {
        const html = renderToStaticMarkup(
            <PaymentBanner
                failed={false}
                first="Anika"
                canRecord={false}
                onCash={() => undefined}
                handover="collection"
            />,
        );
        expect(html).toMatch(
            /<button[^>]*disabled=""[^>]*>Mark paid<\/button>/,
        );
        const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1];
        expect(describedBy).toBeTruthy();
        expect(html).toContain(`id="${describedBy}"`);
        expect(html).toContain("Your role can&#x27;t record payments");
    });

    it("an unpaid order the counter can't record shows Paid in cash disabled", () => {
        const html = renderToStaticMarkup(
            <PaymentBanner
                failed={false}
                first="Anika"
                canRecord={false}
                onCash={() => undefined}
            />,
        );
        expect(html).toMatch(
            /<button[^>]*disabled=""[^>]*>Paid in cash<\/button>/,
        );
    });

    it("reads as before for someone who can record", () => {
        const html = renderToStaticMarkup(
            <PaymentBanner
                failed={false}
                first="Anika"
                canRecord
                onCash={() => undefined}
                handover="collection"
            />,
        );
        expect(html).toContain("Mark paid");
        expect(html).not.toContain("Your role can");
    });
});
