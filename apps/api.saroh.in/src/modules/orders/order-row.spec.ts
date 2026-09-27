import type { RawOrderRow } from "./order-row";
import { serializeOrderRow } from "./order-row";

/**
 * One Orders row (plan B, B1): what it says, and what it leaves out for a
 * caller who may not see money or a customer's contact details.
 */
const now = new Date("2026-09-27T10:00:00.000Z");

function raw(over: Partial<RawOrderRow> = {}): RawOrderRow {
    return {
        id: "o1",
        orderId: "1042",
        customerId: "c1",
        status: "PENDING",
        paymentStatus: "PAID",
        stage: "NEW",
        fulfilment: "COLLECT",
        currency: "INR",
        total: { toString: () => "610" },
        createdAt: new Date("2026-09-27T09:15:00.000Z"),
        courierName: null,
        trackingNumber: null,
        store: { id: "s1", name: "Rye & Co." },
        customer: {
            email: "asha@example.in",
            firstName: "Asha",
            lastName: "Rao",
            phone: "+91 98765 43210",
        },
        items: [
            { product: { name: "Sourdough" } },
            { product: { name: "Croissant" } },
            { product: { name: "Croissant" } },
            { product: { name: "Baguette" } },
            { product: { name: "Focaccia" } },
        ],
        paymentIntents: [{ amountCents: 61000, refunds: [] }],
        ...over,
    };
}

describe("serializeOrderRow", () => {
    it("says what a row needs, money and contact included for a full read", () => {
        const row = serializeOrderRow(raw(), {
            money: true,
            contact: true,
            now,
        });
        expect(row).toMatchObject({
            id: "o1",
            orderId: "1042",
            ageMinutes: 45,
            fulfilment: "COLLECT",
            fulfilmentType: "PICKUP",
            standing: "UNFULFILLED",
            payment: "PAID",
            total: "610.00",
            unpaidAmount: "0.00",
            itemCount: 5,
            productNames: ["Sourdough", "Croissant"],
            moreProducts: 2,
            customer: {
                id: "c1",
                name: "Asha Rao",
                email: "asha@example.in",
                phone: "+91 98765 43210",
            },
        });
    });

    it("says whether it is late by its type's threshold, and by how much (B2b)", () => {
        const view = { money: false, contact: false, now };
        // Placed 45 minutes ago: a pick-up isn't late for two hours.
        expect(serializeOrderRow(raw(), view)).toMatchObject({
            lateAfterMinutes: 120,
            late: false,
            lateBy: null,
        });
        // Placed three hours ago: late by an hour.
        expect(
            serializeOrderRow(
                raw({ createdAt: new Date("2026-09-27T07:00:00.000Z") }),
                view,
            ),
        ).toMatchObject({ lateAfterMinutes: 120, late: true, lateBy: 60 });
        // Collected: never late, however long ago.
        expect(
            serializeOrderRow(
                raw({
                    createdAt: new Date("2026-09-20T07:00:00.000Z"),
                    stage: "COLLECTED",
                    status: "DELIVERED",
                }),
                view,
            ),
        ).toMatchObject({ late: false, lateBy: null });
    });

    it("carries the courier and tracking number (B2b)", () => {
        const row = serializeOrderRow(
            raw({
                fulfilment: "DELIVERY",
                stage: "HANDED_TO_COURIER",
                status: "SHIPPED",
                courierName: "Delhivery",
                trackingNumber: "AWB 4411",
            }),
            { money: false, contact: false, now },
        );
        expect(row).toMatchObject({
            courierName: "Delhivery",
            trackingNumber: "AWB 4411",
            late: false,
        });
    });

    it("leaves out the total and what is unpaid without order:read", () => {
        const row = serializeOrderRow(raw(), {
            money: false,
            contact: true,
            now,
        });
        expect(row).not.toHaveProperty("total");
        expect(row).not.toHaveProperty("unpaidAmount");
        // The payment word is not money: the kitchen needs to know it is paid.
        expect(row.payment).toBe("PAID");
    });

    it("leaves out phone and email without contact:read", () => {
        const row = serializeOrderRow(raw(), {
            money: true,
            contact: false,
            now,
        });
        expect(row.customer).toEqual({ id: "c1", name: "Asha Rao" });
    });

    it("counts an unpaid order's whole total as unpaid", () => {
        const row = serializeOrderRow(
            raw({ paymentStatus: "UNPAID", paymentIntents: [] }),
            { money: true, contact: false, now },
        );
        expect(row.payment).toBe("UNPAID");
        expect(row.unpaidAmount).toBe("610.00");
    });

    it("owes nothing on an order marked paid by hand", () => {
        const row = serializeOrderRow(raw({ paymentIntents: [] }), {
            money: true,
            contact: false,
            now,
        });
        expect(row.unpaidAmount).toBe("0.00");
    });

    it("reads a part refund, and a full one, from the refund sums", () => {
        const part = serializeOrderRow(
            raw({
                paymentIntents: [
                    {
                        amountCents: 61000,
                        refunds: [{ amountCents: 12000, forEdit: false }],
                    },
                ],
            }),
            { money: true, contact: false, now },
        );
        expect(part.payment).toBe("PARTLY_REFUNDED");
        const full = serializeOrderRow(raw({ paymentStatus: "REFUNDED" }), {
            money: true,
            contact: false,
            now,
        });
        expect(full.payment).toBe("REFUNDED");
        expect(full.standing).toBe("REFUNDED");
    });

    it("keeps a row whose customer record is gone", () => {
        const row = serializeOrderRow(raw({ customer: null }), {
            money: true,
            contact: true,
            now,
        });
        expect(row.customer).toBeNull();
    });
});
