import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OrderReadMoney } from "@/lib/orders/read";

import { MoneyCard } from "./money-card";

/**
 * The money card after an edit (audit, 6 Oct 2026): an order paid at the
 * counter and edited up shows what was taken, what is still due, and
 * "Record payment" for whoever may record a payment by hand — never a
 * failure when the business simply hasn't been paid yet.
 */
const money = (over: Partial<OrderReadMoney> = {}): OrderReadMoney => ({
    currency: "INR",
    subtotal: "480.00",
    tax: "0.00",
    shipping: "0.00",
    discount: "0.00",
    total: "480.00",
    paid: "360.00",
    refunded: "0.00",
    due: "120.00",
    recordedByHand: true,
    discountCode: null,
    refundsBeingConfirmed: [],
    ...over,
});

const html = (
    m: OrderReadMoney,
    onRecordPayment?: () => void,
    paymentStatus: "PAID" | "UNPAID" = "PAID",
) =>
    renderToStaticMarkup(
        <MoneyCard
            money={m}
            delivery={false}
            paymentStatus={paymentStatus}
            refundStanding="NONE"
            invoices={null}
            payments={null}
            format={(n) => `₹${n.toFixed(2)}`}
            onRecordPayment={onRecordPayment}
        />,
    );

const noop = () => undefined;

describe("MoneyCard after an edit", () => {
    it("shows what is still due and offers Record payment", () => {
        const out = html(money(), noop);
        expect(out).toContain("Still due");
        expect(out).toContain("₹120.00");
        expect(out).toContain("Record payment");
        expect(out).not.toContain("didn&#x27;t settle");
    });

    it("offers nothing to record when nothing is due", () => {
        const out = html(money({ paid: "480.00", due: "0.00" }), noop);
        expect(out).not.toContain("Still due");
        expect(out).not.toContain("Record payment");
    });

    it("offers nothing to a role that can't record a payment", () => {
        expect(html(money())).not.toContain("Record payment");
    });

    it("leaves an unpaid order to its own Record as paid", () => {
        expect(
            html(money({ paid: "0.00", due: "480.00" }), noop, "UNPAID"),
        ).not.toContain("Record payment");
    });
});

describe("MoneyCard's Paid by for a payment recorded by hand (#834)", () => {
    it("names how it was paid", () => {
        const out = html(
            money({ paid: "480.00", due: "0.00", paidHow: "UPI" }),
        );
        expect(out).toContain("UPI · recorded by hand");
    });

    it("says only recorded by hand when the way was never asked", () => {
        const out = html(money({ paid: "480.00", due: "0.00", paidHow: null }));
        expect(out).toContain("Recorded by hand");
        expect(out).not.toContain("· recorded by hand");
    });
});

describe("MoneyCard after Record as refunded (UX-061)", () => {
    it("says it went back by hand, not only that it was taken", () => {
        const out = renderToStaticMarkup(
            <MoneyCard
                money={money({ paid: "480.00", due: "0.00" })}
                delivery={false}
                paymentStatus="REFUNDED"
                refundStanding="REFUNDED"
                invoices={null}
                payments={null}
                format={(n) => `₹${n.toFixed(2)}`}
            />,
        );
        expect(out).toContain("Refunded");
        expect(out).toContain("₹480.00 · by hand");
    });
});

describe("MoneyCard after part of it was recorded as refunded (#865)", () => {
    it("says what went back by hand and what is left to refund", () => {
        const out = renderToStaticMarkup(
            <MoneyCard
                money={money({
                    paid: "480.00",
                    due: "0.00",
                    refunded: "100.00",
                    refundedByHand: "100.00",
                    leftToRefund: "380.00",
                })}
                delivery={false}
                paymentStatus="PAID"
                refundStanding="PARTLY_REFUNDED"
                invoices={null}
                payments={null}
                format={(n) => `₹${n.toFixed(2)}`}
            />,
        );
        expect(out).toContain("₹100.00 · by hand");
        expect(out).toContain("Left to refund");
        expect(out).toContain("₹380.00");
    });

    it("says nothing is left once it is all refunded", () => {
        const out = renderToStaticMarkup(
            <MoneyCard
                money={money({
                    paid: "480.00",
                    due: "0.00",
                    refunded: "480.00",
                    refundedByHand: "480.00",
                    leftToRefund: "0.00",
                })}
                delivery={false}
                paymentStatus="REFUNDED"
                refundStanding="REFUNDED"
                invoices={null}
                payments={null}
                format={(n) => `₹${n.toFixed(2)}`}
            />,
        );
        expect(out).toContain("₹480.00 · by hand");
        expect(out).not.toContain("Left to refund");
    });
});
