import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OrderRead } from "@/lib/orders/read";

import { OrderTickets } from "./order-tickets";

/**
 * The printed tickets (B6): one to a page, the kitchen's without money, and
 * never a sensitive Needs attention entry on paper.
 */

function order(over: Partial<OrderRead> = {}): OrderRead {
    return {
        id: "o1",
        orderId: "1042",
        placedAt: "2026-09-27T09:00:00.000Z",
        ticketName: "Kitchen ticket",
        fulfilmentType: "PICKUP",
        fulfilmentLabel: "Pick-up",
        store: { id: "s1", name: "Hill Road" },
        customer: {
            id: "c1",
            name: "Priya Raman",
            phone: null,
            contactId: null,
            orderCount: 2,
            firstOrderAt: null,
        },
        walkIn: null,
        deliveryAddress: null,
        notes: "No onions",
        items: [
            {
                id: "l1",
                productId: "p1",
                name: "Sesame bun",
                variantTitle: "Large",
                sku: null,
                imageUrl: null,
                allergens: { contains: [], mayContain: [] },
                quantity: 2,
                refundedQuantity: 0,
                price: "60.00",
            },
        ],
        money: { currency: "INR", total: "120.00" },
        attention: {
            entries: [
                {
                    id: "e1",
                    kind: "ALLERGY",
                    label: "Sesame",
                    detail: null,
                    source: "STAFF",
                    sensitive: false,
                    allergen: null,
                    matchAllergens: [],
                },
                {
                    id: "e2",
                    kind: "MEDICAL",
                    label: "Pregnant",
                    detail: null,
                    source: "STAFF",
                    sensitive: true,
                    allergen: null,
                    matchAllergens: [],
                },
            ],
            hiddenSensitiveCount: 0,
        },
        ...over,
    } as unknown as OrderRead;
}

describe("OrderTickets", () => {
    it("prints each ticket with its lines, note and total, and the box of what may go on paper", () => {
        const html = renderToStaticMarkup(
            <OrderTickets orders={[order()]} noTicket={0} failed={0} />,
        );
        expect(html).toContain("#1042");
        expect(html).toContain("Priya Raman · Pick-up");
        expect(html).toContain("2 × Sesame bun, Large");
        expect(html).toContain("No onions");
        expect(html).toContain("Total ₹120");
        expect(html).toContain("Allergy: Sesame");
        expect(html).not.toContain("Pregnant");
        expect(html).toContain("ticket-page");
        // The bar above the tickets never prints.
        expect(html).toContain("print:hidden");
    });

    it("the kitchen's ticket has no money", () => {
        const kitchen = order({ money: null });
        const lines = kitchen.items.map((i) => ({ ...i, price: undefined }));
        const html = renderToStaticMarkup(
            <OrderTickets
                orders={[{ ...kitchen, items: lines }]}
                noTicket={0}
                failed={0}
            />,
        );
        expect(html).not.toContain("Total");
        expect(html).not.toContain("₹");
    });

    it("says what it couldn't print, and nothing to print when that's all", () => {
        const html = renderToStaticMarkup(
            <OrderTickets orders={[]} noTicket={1} failed={1} />,
        );
        expect(html).toContain("Nothing to print.");
        expect(html).toContain("1 order has no ticket to print.");
        expect(html).toContain("1 order couldn&#x27;t be loaded.");
    });
});
