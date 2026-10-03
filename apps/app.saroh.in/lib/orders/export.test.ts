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
    customer: {
        id: "c1",
        name: 'Ananya "AR" Rao',
        email: "a@example.com",
        phone: "+91 98765 43210",
    },
    status: "PENDING",
    paymentStatus: "PAID",
    stage: "READY",
    fulfilmentType: "PICKUP",
    fulfilmentLabel: "Pick-up",
    steps: [
        { stage: "NEW", label: "New" },
        { stage: "PREPARING", label: "Preparing" },
        { stage: "READY", label: "Ready" },
        { stage: "COLLECTED", label: "Collected" },
    ],
    stepIndex: 2,
    ticketName: "Order ticket",
    late: true,
    payment: "PAID",
    productNames: ["Sourdough", "Croissant"],
    moreProducts: 0,
};

const HEAD =
    "Order,Placed,Customer,Email,Phone,Location,Fulfilment,Step,Late,Payment,Items,Products,Unpaid,Total,Currency";

describe("ordersToCsv", () => {
    it("writes the design's columns: type, step, late and payment", () => {
        const lines = ordersToCsv([order]).split("\r\n");
        expect(lines[0]).toBe(HEAD);
        expect(lines[1]).toBe(
            'ORD-001,2026-09-11T06:30:00.000Z,"Ananya ""AR"" Rao",a@example.com,+91 98765 43210,"Northwind, Whitefield",Pick-up,Ready,Yes,Paid,2,Sourdough; Croissant,0.00,4071.00,INR',
        );
    });

    it("says Refunded or Cancelled where the pill does, and the payment in words", () => {
        const line = ordersToCsv([
            {
                ...order,
                standing: "REFUNDED",
                payment: "REFUNDED",
                late: false,
            },
        ]).split("\r\n")[1];
        expect(line).toContain(",Pick-up,Refunded,No,Refunded,");
        const unpaid = ordersToCsv([
            { ...order, payment: "UNPAID", unpaidAmount: "4071.00" },
        ]).split("\r\n")[1];
        expect(unpaid).toContain(",Not paid yet,");
    });

    it("says how many more products there are past the first two", () => {
        const line = ordersToCsv([
            {
                ...order,
                productNames: ["Sourdough", "Croissant"],
                moreProducts: 3,
            },
        ]).split("\r\n")[1];
        expect(line).toContain(",Sourdough; Croissant; +3 more,");
    });

    it("leaves the money columns out when the rows carry no money", () => {
        const { total: _t, unpaidAmount: _u, ...kitchen } = order;
        const [head, line] = ordersToCsv([kitchen]).split("\r\n");
        expect(head).not.toMatch(/Total|Unpaid|Currency/);
        expect(line).not.toContain("4071.00");
    });

    it("leaves email and phone out when the rows carry no contact details", () => {
        const [head] = ordersToCsv([
            { ...order, customer: { id: "c1", name: "Ananya Rao" } },
        ]).split("\r\n");
        expect(head).not.toMatch(/Email|Phone/);
        expect(head).toContain("Customer");
    });

    it("leaves the customer blank when the record is gone", () => {
        const line = ordersToCsv([order, { ...order, customer: null }]).split(
            "\r\n",
        )[2];
        expect(line).toContain('2026-09-11T06:30:00.000Z,,,,"Northwind');
    });

    it("writes a walk-in by name, marked as one, with their phone (B13)", () => {
        const line = ordersToCsv([
            order,
            {
                ...order,
                customer: null,
                walkIn: { name: "Ravi", phone: "+91 90000 11111" },
            },
        ]).split("\r\n")[2];
        expect(line).toContain(",Ravi (walk-in),,+91 90000 11111,");
    });

    it("writes one line per order: 120 filtered orders are 120 lines", () => {
        const rows = Array.from({ length: 120 }, (_, i) => ({
            ...order,
            id: `o${i}`,
            orderId: `ORD-${i}`,
            fulfilmentType: "SHIPPING" as const,
            fulfilmentLabel: "Shipping",
        }));
        const lines = ordersToCsv(rows).split("\r\n");
        expect(lines).toHaveLength(121);
        expect(lines.slice(1).every((l) => l.includes(",Shipping,"))).toBe(
            true,
        );
    });
});
