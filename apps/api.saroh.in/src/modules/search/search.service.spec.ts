// DB-free unit tests: the database package is mocked so nothing touches a real
// Postgres.
jest.mock("@saroh/database", () => {
    return {
        prisma: {
            contact: { findMany: jest.fn() },
            lead: { findMany: jest.fn() },
            order: { findMany: jest.fn() },
        },
    };
});

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { SearchService } from "./search.service";

const contactFindMany = prisma.contact.findMany as jest.Mock;
const leadFindMany = prisma.lead.findMany as jest.Mock;
const orderFindMany = prisma.order.findMany as jest.Mock;

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
        contactFindMany.mockResolvedValue([]);
        leadFindMany.mockResolvedValue([]);
        orderFindMany.mockResolvedValue([]);
    });

    it("does no I/O at all for a one-character query", async () => {
        // A single letter matches most of the database and helps nobody; three
        // round trips to prove it is pure waste on every keystroke.
        const service = new SearchService();

        const result = await service.search(ctx(), "a");

        expect(result.hits).toEqual([]);
        expect(contactFindMany).not.toHaveBeenCalled();
        expect(leadFindMany).not.toHaveBeenCalled();
        expect(orderFindMany).not.toHaveBeenCalled();
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

        for (const mock of [contactFindMany, leadFindMany, orderFindMany]) {
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
            href: "/stores/store_1/orders/ord_1",
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

        for (const mock of [contactFindMany, leadFindMany, orderFindMany]) {
            expect(mock).toHaveBeenCalledWith(
                expect.objectContaining({ take: 5 }),
            );
        }
    });

    it("reads nothing a MEMBER could not read from the list screens", async () => {
        // The whole point of gating per entity: a palette is a read surface like
        // any other, and must not be the one place a role sees more.
        const service = new SearchService();

        const result = await service.search(ctx({ role: "MEMBER" }), "ananya");

        expect(result.hits).toEqual([]);
        expect(contactFindMany).not.toHaveBeenCalled();
        expect(leadFindMany).not.toHaveBeenCalled();
        expect(orderFindMany).not.toHaveBeenCalled();
    });
});
