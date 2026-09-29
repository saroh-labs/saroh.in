import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
    CustomerDetail,
    DetailOrder,
} from "@/lib/customer-workspace/detail";

import { Overview } from "./overview";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

/**
 * Customer Detail's Overview for someone who has ordered: "Usually buys"
 * lists the products they come back for, and is left out when their
 * orders hold none — a clinic's treatment bills a service, not a product
 * (E9), and an empty card said nothing (round-2 verify, customers).
 */

const NOW = new Date("2026-09-29T10:00:00Z");

const order = (items: DetailOrder["items"]): DetailOrder => ({
    id: "o1",
    number: "ORD-001",
    placedAt: "2026-09-11T01:30:00Z",
    status: "CONFIRMED",
    paymentStatus: "PAID",
    itemCount: items.length,
    items,
    fulfilmentType: "PICKUP",
    stage: "NEW",
    delivery: null,
    total: "12000.00",
    currency: "INR",
    via: { customerId: "sc1", storefront: { id: "s1", name: "Kavi Dental" } },
});

const customer = (rows: DetailOrder[]): CustomerDetail => ({
    contact: {
        id: "c1",
        name: "Rahul Verma",
        firstName: "Rahul",
        lastName: "Verma",
        email: "rahul@example.in",
        phone: null,
        company: null,
        source: null,
        createdAt: "2026-09-01T00:00:00Z",
    },
    money: true,
    timezone: "Asia/Kolkata",
    stats: { orders: rows.length },
    notes: { from: "contact", rows: [], allergenChoices: [] },
    allergens: [],
    orders: { from: "linked-customers", rows },
    consent: null,
    unavailable: [],
});

const overview = (d: CustomerDetail) =>
    renderToStaticMarkup(
        <Overview
            d={d}
            now={NOW}
            canStop={false}
            stopping={false}
            canConsent={false}
            onStop={vi.fn()}
            onOrders={vi.fn()}
            onBookings={vi.fn()}
        />,
    );

describe("Usually buys", () => {
    it("lists the products they order", () => {
        const html = overview(
            customer([
                order([
                    {
                        productId: "p1",
                        kind: "product",
                        name: "Sourdough loaf",
                        variant: null,
                        quantity: 1,
                    },
                ]),
            ]),
        );
        expect(html).toContain('aria-label="Usually buys"');
        expect(html).toContain("Sourdough loaf");
    });

    it("is left out when their orders bill only services", () => {
        const html = overview(
            customer([
                order([
                    {
                        productId: null,
                        kind: "service",
                        name: "Root canal treatment",
                        variant: null,
                        quantity: 1,
                    },
                ]),
            ]),
        );
        expect(html).not.toContain("Usually buys");
        // The rest of the order picture still shows.
        expect(html).toContain('aria-label="How they get orders"');
    });
});
