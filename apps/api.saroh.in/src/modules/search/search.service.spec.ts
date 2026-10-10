// DB-free unit tests: the database package is mocked so nothing touches a real
// Postgres.
jest.mock("@saroh/database", () => {
    return {
        // The location-scoped role's key (`orders/order-location.ts`).
        STOREFRONT_TEAM_ROLE_KEY: "storefront-team",
        STOREFRONT_TEAM_ROLE_LABEL: "Storefront team",
        STOREFRONT_TEAM_ACTIONS: [],
        prisma: {
            contact: { findMany: jest.fn() },
            lead: { findMany: jest.fn() },
            order: { findMany: jest.fn() },
            product: { findMany: jest.fn() },
            service: { findMany: jest.fn() },
            booking: { findMany: jest.fn() },
            invoice: { findMany: jest.fn() },
            customerSubscription: { findMany: jest.fn() },
            // A Calendar only person's own diary (`own-diary.ts`).
            membership: { findUnique: jest.fn() },
        },
    };
});

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CALENDAR_ONLY_ROLE_KEY } from "../organizations/calendar-only-role";
import { STOREFRONT_TEAM_ROLE_KEY } from "../organizations/storefront-team-role";
import { SearchService } from "./search.service";

const contactFindMany = prisma.contact.findMany as jest.Mock;
const leadFindMany = prisma.lead.findMany as jest.Mock;
const orderFindMany = prisma.order.findMany as jest.Mock;
const productFindMany = prisma.product.findMany as jest.Mock;
const serviceFindMany = prisma.service.findMany as jest.Mock;
const bookingFindMany = prisma.booking.findMany as jest.Mock;
const invoiceFindMany = prisma.invoice.findMany as jest.Mock;
const subscriptionFindMany = prisma.customerSubscription.findMany as jest.Mock;
const membershipFindUnique = prisma.membership.findUnique as jest.Mock;

/** Every read the palette makes, with the permission that opens it. */
const READS = [
    { name: "contacts", mock: contactFindMany, action: "contact:read" },
    { name: "leads", mock: leadFindMany, action: "lead:read" },
    { name: "orders", mock: orderFindMany, action: "order:read" },
    { name: "products", mock: productFindMany, action: "store:read" },
    { name: "services", mock: serviceFindMany, action: "service:read" },
    { name: "bookings", mock: bookingFindMany, action: "booking:read" },
    { name: "invoices", mock: invoiceFindMany, action: "invoice:read" },
    {
        name: "subscriptions",
        mock: subscriptionFindMany,
        action: "subscription:read",
    },
] as const;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

describe("SearchService", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        for (const read of READS) read.mock.mockResolvedValue([]);
        membershipFindUnique.mockResolvedValue(null);
    });

    it("does no I/O at all for a one-character query", async () => {
        // A single letter matches most of the database and helps nobody; three
        // round trips to prove it is pure waste on every keystroke.
        const service = new SearchService();

        const result = await service.search(ctx(), "a");

        expect(result.hits).toEqual([]);
        for (const read of READS) expect(read.mock).not.toHaveBeenCalled();
    });

    it("treats a whitespace-only query as empty", async () => {
        const service = new SearchService();

        const result = await service.search(ctx(), "   ");

        expect(result.hits).toEqual([]);
        expect(contactFindMany).not.toHaveBeenCalled();
    });

    it("scopes every read to the ctx org", async () => {
        const service = new SearchService();

        await service.search(ctx(), "ananya");

        for (const { mock } of READS) {
            expect(mock).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        organizationId: "org_1",
                    }),
                }),
            );
        }
    });

    it("returns a contact with the href the client should navigate to", async () => {
        // The palette must never have to know how a URL is built per entity.
        const service = new SearchService();
        contactFindMany.mockResolvedValue([
            {
                id: "c_1",
                firstName: "Ananya",
                lastName: "Rao",
                email: "ananya@example.com",
                company: "Sunrise Cafe",
            },
        ]);

        const { hits } = await service.search(ctx(), "ananya");

        expect(hits).toEqual([
            {
                kind: "contact",
                id: "c_1",
                title: "Ananya Rao",
                subtitle: "ananya@example.com",
                href: "/contacts/c_1",
            },
        ]);
    });

    it("falls back to the email when a contact has no name", async () => {
        const service = new SearchService();
        contactFindMany.mockResolvedValue([
            {
                id: "c_2",
                firstName: null,
                lastName: null,
                email: "walkin@example.com",
                company: null,
            },
        ]);

        const { hits } = await service.search(ctx(), "walkin");

        expect(hits[0]?.title).toBe("walkin@example.com");
    });

    it("finds a lead by the name of the person it is about", async () => {
        // Searching "Ananya" must reach her lead, not only her contact record.
        const service = new SearchService();
        leadFindMany.mockResolvedValue([
            {
                id: "lead_1",
                title: "Bulk order enquiry",
                status: "OPEN",
                contact: {
                    firstName: "Ananya",
                    lastName: "Rao",
                    email: "ananya@example.com",
                },
            },
        ]);

        const { hits } = await service.search(ctx(), "ananya");

        expect(hits[0]).toMatchObject({
            kind: "lead",
            title: "Bulk order enquiry",
            subtitle: "Ananya Rao · open",
            href: "/leads/lead_1",
        });
        // The contact relation must actually be part of the query, or the
        // above only passes because the mock ignored the filter.
        const where = leadFindMany.mock.calls[0]?.[0]?.where;
        expect(where.AND[0].OR).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ contact: expect.anything() }),
            ]),
        );
    });

    it("routes an order hit through its own store", async () => {
        const service = new SearchService();
        orderFindMany.mockResolvedValue([
            {
                id: "ord_1",
                orderId: "ORD-004",
                storeId: "store_1",
                status: "PENDING",
                customer: {
                    firstName: "Vikram",
                    lastName: "Shetty",
                    email: "vikram@example.com",
                },
            },
        ]);

        const { hits } = await service.search(ctx(), "ORD-004");

        expect(hits[0]).toMatchObject({
            kind: "order",
            href: "/commerce/orders/ord_1?storefront=store_1",
            subtitle: "Vikram Shetty · pending",
        });
    });

    it("requires every WORD to match, so a full name finds the person", async () => {
        // Matching the whole string per column looks right and fails on the
        // most natural input: "ananya rao" matches neither firstName "Ananya"
        // nor lastName "Rao", so searching someone's full name found nothing
        // while their first name alone worked.
        const service = new SearchService();

        await service.search(ctx(), "ananya rao");

        const where = contactFindMany.mock.calls[0]?.[0]?.where;
        expect(where.AND).toHaveLength(2);
        expect(where.AND[0].OR).toEqual(
            expect.arrayContaining([
                { firstName: { contains: "ananya", mode: "insensitive" } },
            ]),
        );
        expect(where.AND[1].OR).toEqual(
            expect.arrayContaining([
                { lastName: { contains: "rao", mode: "insensitive" } },
            ]),
        );
    });

    it("caps the number of terms so a pasted paragraph is not a 40-clause query", async () => {
        const service = new SearchService();

        await service.search(ctx(), "a b c d e f g h i j k");

        expect(contactFindMany.mock.calls[0]?.[0]?.where.AND).toHaveLength(6);
    });

    it("caps each entity so the palette never becomes the list screen", async () => {
        const service = new SearchService();

        await service.search(ctx(), "test");

        for (const { mock } of READS) {
            expect(mock).toHaveBeenCalledWith(
                expect.objectContaining({ take: 5 }),
            );
        }
    });

    it("reads nothing a MEMBER could not read from the list screens", async () => {
        // The whole point of gating per entity: a palette is a read surface like
        // any other, and must not be the one place a role sees more. A Member
        // reads contacts (the diary's people), never leads or orders.
        const service = new SearchService();

        await service.search(ctx({ role: "MEMBER" }), "ananya");

        expect(contactFindMany).toHaveBeenCalled();
        expect(leadFindMany).not.toHaveBeenCalled();
        expect(orderFindMany).not.toHaveBeenCalled();
    });

    it.each(READS)(
        "reads $name only for someone who holds $action",
        async ({ mock, action }) => {
            const service = new SearchService();
            const every = READS.map((r) => r.action);

            // Everything but this one: this read is never made.
            await service.search(
                ctx({
                    actions: new Set(every.filter((a) => a !== action)),
                }),
                "ananya",
            );
            expect(mock).not.toHaveBeenCalled();
            for (const other of READS) {
                if (other.mock !== mock) {
                    expect(other.mock).toHaveBeenCalled();
                }
            }

            // This one alone: it is the only read made.
            jest.clearAllMocks();
            await service.search(ctx({ actions: new Set([action]) }), "ananya");
            expect(mock).toHaveBeenCalled();
            for (const other of READS) {
                if (other.mock !== mock) {
                    expect(other.mock).not.toHaveBeenCalled();
                }
            }
        },
    );

    it("leaves merged and removed people out, and finds one by their phone", async () => {
        await new SearchService().search(ctx(), "98765");

        const where = contactFindMany.mock.calls[0]?.[0]?.where;
        expect(where).toMatchObject({ mergedIntoId: null, removedAt: null });
        expect(where.AND[0].OR).toEqual(
            expect.arrayContaining([{ phone: { contains: "98765" } }]),
        );
    });

    it("a product is found by name or SKU, and reads Draft or Live", async () => {
        productFindMany.mockResolvedValue([
            { id: "p_1", name: "Sourdough loaf", status: "PUBLISHED" },
            { id: "p_2", name: "Sourdough starter", status: "DRAFT" },
        ]);

        const { hits } = await new SearchService().search(ctx(), "sourdough");

        expect(hits).toEqual([
            {
                kind: "product",
                id: "p_1",
                title: "Sourdough loaf",
                subtitle: "live",
                href: "/commerce/products/p_1",
            },
            {
                kind: "product",
                id: "p_2",
                title: "Sourdough starter",
                subtitle: "draft",
                href: "/commerce/products/p_2",
            },
        ]);
        expect(productFindMany.mock.calls[0]?.[0]?.where.AND[0].OR).toEqual([
            { name: { contains: "sourdough", mode: "insensitive" } },
            {
                variants: {
                    some: {
                        sku: { contains: "sourdough", mode: "insensitive" },
                    },
                },
            },
        ]);
    });

    it("a service opens its own page", async () => {
        serviceFindMany.mockResolvedValue([
            {
                id: "svc_1",
                name: "Check-up",
                status: "ACTIVE",
                durationMinutes: 45,
            },
        ]);

        const { hits } = await new SearchService().search(ctx(), "check");

        expect(hits).toEqual([
            {
                kind: "service",
                id: "svc_1",
                title: "Check-up",
                subtitle: "45 min",
                href: "/services/svc_1",
            },
        ]);
    });

    it("a booking says who, what and when, in the zone it was made in", async () => {
        bookingFindMany.mockResolvedValue([
            {
                id: "bk_1",
                startAt: new Date("2026-10-12T04:00:00.000Z"),
                timezone: "Asia/Kolkata",
                status: "CONFIRMED",
                bookerName: "A. Rao",
                bookerEmail: "asha@example.com",
                service: { name: "Check-up" },
                contact: {
                    firstName: "Asha",
                    lastName: "Rao",
                    email: "asha@example.com",
                },
            },
            {
                id: "bk_2",
                startAt: new Date("2026-10-13T04:00:00.000Z"),
                timezone: "Asia/Kolkata",
                status: "CANCELLED",
                bookerName: "Walk in",
                bookerEmail: null,
                service: { name: "Check-up" },
                contact: null,
            },
        ]);

        const { hits } = await new SearchService().search(ctx(), "check");

        expect(hits[0]).toMatchObject({
            kind: "booking",
            title: "Asha Rao, Check-up",
            href: "/bookings/bk_1",
        });
        expect(hits[0]?.subtitle).toMatch(/^12 Oct, 9:30\s?am$/i);
        expect(hits[1]?.title).toBe("Walk in, Check-up");
        expect(hits[1]?.subtitle).toMatch(/· cancelled$/);
        // Never a hold that hasn't become a booking.
        expect(bookingFindMany.mock.calls[0]?.[0]?.where.status).toEqual({
            in: ["CONFIRMED", "CANCELLED"],
        });
    });

    it("a Calendar only person finds only their own diary's bookings", async () => {
        membershipFindUnique.mockResolvedValue({
            staffMember: { id: "staff_1", services: [{ serviceId: "svc_1" }] },
        });

        await new SearchService().search(
            ctx({
                roleKey: CALENDAR_ONLY_ROLE_KEY,
                actions: new Set(["booking:read"]),
            }),
            "asha",
        );

        const and = bookingFindMany.mock.calls[0]?.[0]?.where.AND;
        expect(and[and.length - 1]).toEqual({
            AND: [
                {
                    OR: [
                        { staffId: "staff_1" },
                        { staffId: null, serviceId: { in: ["svc_1"] } },
                    ],
                },
            ],
        });
    });

    it("a Calendar only person not on the diary finds no bookings, never everyone's", async () => {
        membershipFindUnique.mockResolvedValue({ staffMember: null });

        await new SearchService().search(
            ctx({
                roleKey: CALENDAR_ONLY_ROLE_KEY,
                actions: new Set(["booking:read"]),
            }),
            "asha",
        );

        const and = bookingFindMany.mock.calls[0]?.[0]?.where.AND;
        expect(and[and.length - 1]).toEqual({ AND: [{ id: { in: [] } }] });
    });

    it("a location's own people find only their location's orders", async () => {
        await new SearchService().search(
            ctx({
                roleKey: STOREFRONT_TEAM_ROLE_KEY,
                userId: "user_9",
                actions: new Set(["order:read"]),
            }),
            "ORD-004",
        );

        expect(orderFindMany.mock.calls[0]?.[0]?.where.store).toEqual({
            members: { some: { userId: "user_9" } },
        });
    });

    it("an invoice is found by number or by who it bills", async () => {
        invoiceFindMany.mockResolvedValue([
            {
                id: "inv_1",
                number: "INV-0042",
                status: "PARTIALLY_PAID",
                billToName: "Meera Iyer",
                contact: null,
            },
            {
                id: "inv_2",
                number: null,
                status: "DRAFT",
                billToName: null,
                contact: null,
            },
        ]);

        const { hits } = await new SearchService().search(ctx(), "meera");

        expect(hits).toEqual([
            {
                kind: "invoice",
                id: "inv_1",
                title: "INV-0042",
                subtitle: "Meera Iyer · partially paid",
                href: "/billing/invoices/inv_1",
            },
            {
                kind: "invoice",
                id: "inv_2",
                title: "Draft invoice",
                subtitle: "draft",
                href: "/billing/invoices/inv_2",
            },
        ]);
    });

    it("a subscription is found by who subscribes or by its plan", async () => {
        subscriptionFindMany.mockResolvedValue([
            {
                id: "sub_1",
                status: "ACTIVE",
                plan: { name: "Weekly bread box" },
                contact: {
                    firstName: "Vikram",
                    lastName: "Shetty",
                    email: "vikram@example.com",
                },
            },
        ]);

        const { hits } = await new SearchService().search(ctx(), "bread");

        expect(hits).toEqual([
            {
                kind: "subscription",
                id: "sub_1",
                title: "Vikram Shetty",
                subtitle: "Weekly bread box · active",
                href: "/billing/subscriptions/sub_1",
            },
        ]);
    });
});
