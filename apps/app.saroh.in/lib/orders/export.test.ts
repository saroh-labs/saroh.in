import { describe, expect, it } from "vitest";

import type { OrderRow } from "@/lib/orders/business-service";
import { ordersToCsv } from "@/lib/orders/export";

const order: OrderRow = {
    id: "o1",
    orderId: "ORD-001",
    standing: "UNFULFILLED",
    total: "4071.00",
    unpaidAmount: "0.00",
    currency: "INR",
    placedAt: "2026-09-11T06:30:00.000Z",
    ageMinutes: 45,
    itemCount: 2,
    store: { id: "s1", name: "Northwind, Whitefield" },
    customer: { id: "c1", name: 'Ananya "AR" Rao', email: "a@example.com" },
    status: "PENDING",
    paymentStatus: "PAID",
    stage: "NEW",
    fulfilment: "COLLECT",
    fulfilmentType: "PICKUP",
    payment: "PAID",
    productNames: ["Sourdough", "Croissant"],
    moreProducts: 0,
};

describe("ordersToCsv", () => {
    it("writes a header and one line per order, standing in words", () => {
        const lines = ordersToCsv([order]).split("\r\n");
        expect(lines[0]).toBe(
            "Order,Placed,Storefront,Customer,Email,Items,Total,Currency,Standing",
        );
        expect(lines[1]).toContain("ORD-001");
        expect(lines[1]).toContain("4071.00,INR,Unfulfilled");
    });

    it("quotes commas and doubles quotes, so a name never splits a column", () => {
        const line = ordersToCsv([order]).split("\r\n")[1];
        expect(line).toContain('"Northwind, Whitefield"');
        expect(line).toContain('"Ananya ""AR"" Rao"');
    });

    it("leaves the customer blank when the record is gone", () => {
        const line = ordersToCsv([{ ...order, customer: null }]).split(
            "\r\n",
        )[1];
        expect(line).toContain(',"Northwind, Whitefield",,,2,');
    });
});
