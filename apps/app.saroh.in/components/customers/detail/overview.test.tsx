import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ADDED_BY_HAND } from "@/lib/customer-workspace/added";
import type {
    CustomerDetail,
    DetailOrder,
} from "@/lib/customer-workspace/detail";
import { canStopOffers } from "@/lib/customer-workspace/view";

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

describe("Delivery address before a first order (DEC-073)", () => {
    const handAdded = (address: Partial<CustomerDetail["contact"]>) =>
        overview({
            ...customer([]),
            contact: {
                ...customer([]).contact,
                source: ADDED_BY_HAND,
                ...address,
            },
        });

    it("a customer added by hand shows their saved address", () => {
        const html = handAdded({
            addressLine1: "14 Hill Road",
            addressLine2: null,
            city: "Mumbai",
            postalCode: "400050",
            state: "Maharashtra",
            country: "IN",
        });
        expect(html).toContain("No orders yet");
        expect(html).toContain("Added by hand");
        expect(html).toContain('aria-label="Delivery address"');
        expect(html).toContain("14 Hill Road, Mumbai 400050, Maharashtra");
    });

    it("draws no address card when none is saved", () => {
        const html = handAdded({ addressLine1: null, city: null });
        expect(html).toContain("No orders yet");
        expect(html).not.toContain("Delivery address");
    });

    it("once they have ordered, the address sits in How they get orders", () => {
        const html = overview({
            ...customer([
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
            contact: {
                ...customer([]).contact,
                addressLine1: "14 Hill Road",
                city: "Mumbai",
            },
        });
        expect(html).not.toContain('aria-label="Delivery address"');
        expect(html).toContain("14 Hill Road, Mumbai");
    });
});

describe("Offers and news (DEC-073)", () => {
    const withConsent = (consent: CustomerDetail["consent"]) =>
        renderToStaticMarkup(
            <Overview
                d={{ ...customer([]), consent }}
                now={NOW}
                canStop={canStopOffers(consent)}
                stopping={false}
                canConsent
                onStop={vi.fn()}
                onOrders={vi.fn()}
                onBookings={vi.fn()}
            />,
        );

    it('with nothing recorded says only that: no "They asked to stop"', () => {
        const html = withConsent({ status: null, source: null, at: null });
        expect(html).toContain("Nothing recorded yet.");
        expect(html).not.toContain("They asked to stop");
    });

    it('offers "They asked to stop" once they have said yes', () => {
        const html = withConsent({
            status: "GRANTED",
            source: "checkout",
            at: "2026-09-18T00:00:00Z",
        });
        expect(html).toContain("Said yes to offers by email");
        expect(html).toContain("They asked to stop</button>");
    });

    it("not again once they asked to stop", () => {
        const html = withConsent({
            status: "REVOKED",
            source: null,
            at: "2026-09-20T00:00:00Z",
        });
        expect(html).toContain("Asked to stop");
        expect(html).not.toContain("They asked to stop</button>");
    });
});
