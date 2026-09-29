// How an order stands for a pay link (B11), and B9's balance: what was
// received is compared with the order's current total, for a site
// checkout's order too. DB-free.
import type { PayLinkOrder } from "./order-pay-link";
import { dueCentsOf, payLinkRefusal, payLinkStanding } from "./order-pay-link";

function order(over: Partial<PayLinkOrder> = {}): PayLinkOrder {
    return {
        id: "o_1",
        organizationId: "org_1",
        storeId: "s_1",
        status: "PROCESSING",
        paymentStatus: "PAID",
        placedOnline: false,
        total: "520.00",
        currency: "INR",
        store: { settings: null },
        paymentIntents: [{ amountCents: 48000, refunds: [] }],
        invoices: [],
        ...over,
    } as unknown as PayLinkOrder;
}

describe("payLinkStanding", () => {
    it("a site checkout's order paid online that now costs more is due its balance (B9)", () => {
        const o = order({ placedOnline: true });
        expect(payLinkStanding(o)).toBe("DUE");
        expect(dueCentsOf(o)).toBe(4000);
        expect(payLinkRefusal(o)).toBeNull();
    });

    it("the same for an order made by staff and paid online", () => {
        expect(payLinkStanding(order())).toBe("DUE");
    });

    it("paid in full online, a site checkout's order is paid", () => {
        const o = order({
            placedOnline: true,
            total: "480.00" as never,
        });
        expect(payLinkStanding(o)).toBe("PAID");
        expect(payLinkRefusal(o)).toBe("This order is already paid.");
    });

    it("money handed back for an edit counts against what was received", () => {
        const o = order({
            placedOnline: true,
            total: "480.00" as never,
            paymentIntents: [
                {
                    amountCents: 52000,
                    refunds: [{ amountCents: 8000, forEdit: true }],
                },
            ],
        });
        expect(dueCentsOf(o)).toBe(4000);
        expect(payLinkStanding(o)).toBe("DUE");
    });

    it("paid by hand, the counter settles any difference", () => {
        expect(payLinkStanding(order({ paymentIntents: [] }))).toBe("PAID");
    });

    it("cancelled or refunded is closed", () => {
        expect(payLinkStanding(order({ status: "CANCELLED" }))).toBe("CLOSED");
        expect(payLinkStanding(order({ paymentStatus: "REFUNDED" }))).toBe(
            "CLOSED",
        );
    });

    it("unpaid is due the whole total", () => {
        const o = order({ paymentStatus: "UNPAID", paymentIntents: [] });
        expect(payLinkStanding(o)).toBe("DUE");
        expect(dueCentsOf(o)).toBe(52000);
    });
});
