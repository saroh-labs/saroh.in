// DB-free unit tests: the database package is mocked so nothing touches a real
// Postgres. The lead/booking delegates are here because the list rollup reads
// them — see ContactListItem.
jest.mock("@saroh/database", () => {
    return {
        prisma: {
            contact: {
                findMany: jest.fn(),
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            lead: { groupBy: jest.fn() },
            booking: { groupBy: jest.fn() },
        },
    };
});

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ContactsService } from "./contacts.service";

const findMany = prisma.contact.findMany as jest.Mock;
const findUnique = prisma.contact.findUnique as jest.Mock;
const update = prisma.contact.update as jest.Mock;
const leadGroupBy = prisma.lead.groupBy as jest.Mock;
const bookingGroupBy = prisma.booking.groupBy as jest.Mock;

const CONTACT = {
    id: "c_1",
    organizationId: "org_1",
    email: "ananya@example.com",
    firstName: "Ananya",
    lastName: "Rao",
};

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

describe("ContactsService.list", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        leadGroupBy.mockResolvedValue([]);
        bookingGroupBy.mockResolvedValue([]);
    });

    it("scopes to the ctx org, newest first", async () => {
        const service = new ContactsService();
        findMany.mockResolvedValue([]);

        await service.list(ctx());

        expect(findMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1" },
            orderBy: { createdAt: "desc" },
        });
    });

    it("denies a MEMBER (contact:read is OWNER/ADMIN-only) before any I/O", async () => {
        const service = new ContactsService();
        await expect(
            service.list(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(findMany).not.toHaveBeenCalled();
    });

    it("runs no rollup queries at all for an empty org", async () => {
        // A `contactId: { in: [] }` aggregate is a round trip that can only
        // return nothing.
        const service = new ContactsService();
        findMany.mockResolvedValue([]);

        await service.list(ctx());

        expect(leadGroupBy).not.toHaveBeenCalled();
        expect(bookingGroupBy).not.toHaveBeenCalled();
    });

    it("attaches open pipeline value and the next booking to each row", async () => {
        const service = new ContactsService();
        findMany.mockResolvedValue([CONTACT]);
        leadGroupBy.mockResolvedValue([
            { contactId: "c_1", _sum: { value: 4500000 }, _count: { _all: 2 } },
        ]);
        const startAt = new Date("2026-08-06T09:00:00.000Z");
        bookingGroupBy.mockResolvedValue([
            { contactId: "c_1", _min: { startAt } },
        ]);

        const [row] = await service.list(ctx());

        expect(row).toMatchObject({
            id: "c_1",
            openLeadValue: 4500000,
            openLeadCount: 2,
            nextBookingAt: startAt,
        });
    });

    it("aggregates the whole page in one query per relation, not one per contact", async () => {
        const service = new ContactsService();
        findMany.mockResolvedValue([
            CONTACT,
            { ...CONTACT, id: "c_2" },
            { ...CONTACT, id: "c_3" },
        ]);

        await service.list(ctx());

        expect(leadGroupBy).toHaveBeenCalledTimes(1);
        expect(bookingGroupBy).toHaveBeenCalledTimes(1);
        expect(leadGroupBy).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    contactId: { in: ["c_1", "c_2", "c_3"] },
                    status: "OPEN",
                }),
            }),
        );
    });

    it("keeps a null total distinct from zero when leads carry no value", async () => {
        // `Lead.value` is optional. Two open leads with no amount recorded is
        // not "₹0 of pipeline" — collapsing it would invent a fact.
        const service = new ContactsService();
        findMany.mockResolvedValue([CONTACT]);
        leadGroupBy.mockResolvedValue([
            { contactId: "c_1", _sum: { value: null }, _count: { _all: 2 } },
        ]);

        const [row] = await service.list(ctx());

        expect(row?.openLeadValue).toBeNull();
        expect(row?.openLeadCount).toBe(2);
    });

    it("drops bookings that belong to no contact", async () => {
        // A walk-in books without a Contact, so the groupBy key is null.
        const service = new ContactsService();
        findMany.mockResolvedValue([CONTACT]);
        bookingGroupBy.mockResolvedValue([
            { contactId: null, _min: { startAt: new Date() } },
        ]);

        const [row] = await service.list(ctx());

        expect(row?.nextBookingAt).toBeNull();
    });
});

describe("ContactsService.get", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns an owned contact with its leads included", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue({
            id: "c_1",
            organizationId: "org_1",
            leads: [],
        });

        const res = await service.get(ctx(), "c_1");

        expect(res.id).toBe("c_1");
        expect(findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "c_1" },
                include: expect.objectContaining({
                    leads: expect.any(Object),
                }),
            }),
        );
    });

    it("404s a cross-tenant contact", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue({
            id: "c_1",
            organizationId: "org_OTHER",
            leads: [],
        });

        await expect(service.get(ctx(), "c_1")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("404s a missing contact", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue(null);

        await expect(service.get(ctx(), "nope")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe("ContactsService.update", () => {
    beforeEach(() => jest.clearAllMocks());

    it("patches only the supplied fields of an owned contact", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue({ id: "c_1", organizationId: "org_1" });
        update.mockResolvedValue({ id: "c_1" });

        await service.update(ctx(), "c_1", { company: "Acme" });

        expect(update).toHaveBeenCalledWith({
            where: { id: "c_1" },
            data: { company: "Acme" },
        });
    });

    it("404s (and never writes) a cross-tenant contact", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue({
            id: "c_1",
            organizationId: "org_OTHER",
        });

        await expect(
            service.update(ctx(), "c_1", { company: "Acme" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(update).not.toHaveBeenCalled();
    });

    it("denies a MEMBER (contact:write is OWNER/ADMIN-only) before any I/O", async () => {
        const service = new ContactsService();
        await expect(
            service.update(ctx({ role: "MEMBER" }), "c_1", { company: "Acme" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(findUnique).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });
});
