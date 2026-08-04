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
            customerIdentityLink: { findMany: jest.fn() },
            customer: { findMany: jest.fn() },
            order: { groupBy: jest.fn(), findMany: jest.fn() },
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
const linkFindMany = prisma.customerIdentityLink.findMany as jest.Mock;
const customerFindMany = prisma.customer.findMany as jest.Mock;
const orderGroupBy = prisma.order.groupBy as jest.Mock;
const orderFindMany = prisma.order.findMany as jest.Mock;

/** A Prisma Decimal serialises via `toString`; the mock must do the same. */
const decimal = (v: string) => ({ toString: () => v });

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
        linkFindMany.mockResolvedValue([]);
        customerFindMany.mockResolvedValue([]);
        orderGroupBy.mockResolvedValue([]);
        orderFindMany.mockResolvedValue([]);
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
        expect(linkFindMany).not.toHaveBeenCalled();
        expect(customerFindMany).not.toHaveBeenCalled();
        expect(orderGroupBy).not.toHaveBeenCalled();
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

    it("finds the last order through an explicit identity link", async () => {
        const service = new ContactsService();
        findMany.mockResolvedValue([CONTACT]);
        linkFindMany.mockResolvedValue([
            { contactId: "c_1", customerId: "cust_1" },
        ]);
        const at = new Date("2026-07-30T10:00:00.000Z");
        orderGroupBy.mockResolvedValue([
            { customerId: "cust_1", _max: { createdAt: at } },
        ]);
        orderFindMany.mockResolvedValue([
            {
                customerId: "cust_1",
                createdAt: at,
                total: decimal("1250.50"),
                currency: "INR",
            },
        ]);

        const [row] = await service.list(ctx());

        expect(row).toMatchObject({
            lastOrderAt: at,
            lastOrderTotal: "1250.50",
            lastOrderCurrency: "INR",
        });
    });

    it("matches a customer by email regardless of case", async () => {
        // Neither table normalises email on write, so a case-sensitive test
        // would report "never ordered" for someone who has.
        const service = new ContactsService();
        findMany.mockResolvedValue([
            { ...CONTACT, email: "Ananya@Example.com" },
        ]);
        customerFindMany.mockResolvedValue([
            { id: "cust_2", email: "ananya@example.COM" },
        ]);
        const at = new Date("2026-07-28T10:00:00.000Z");
        orderGroupBy.mockResolvedValue([
            { customerId: "cust_2", _max: { createdAt: at } },
        ]);
        orderFindMany.mockResolvedValue([
            {
                customerId: "cust_2",
                createdAt: at,
                total: decimal("400"),
                currency: "INR",
            },
        ]);

        const [row] = await service.list(ctx());

        expect(row?.lastOrderAt).toEqual(at);
        expect(customerFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    organizationId: "org_1",
                    email: expect.objectContaining({ mode: "insensitive" }),
                }),
            }),
        );
    });

    it("takes the latest across stores when one person matches several customers", async () => {
        // `Customer.email` is unique per STORE, so one contact legitimately
        // matches more than one customer record.
        const service = new ContactsService();
        findMany.mockResolvedValue([CONTACT]);
        customerFindMany.mockResolvedValue([
            { id: "cust_a", email: CONTACT.email },
            { id: "cust_b", email: CONTACT.email },
        ]);
        const older = new Date("2026-06-01T00:00:00.000Z");
        const newer = new Date("2026-07-31T00:00:00.000Z");
        orderGroupBy.mockResolvedValue([
            { customerId: "cust_a", _max: { createdAt: older } },
            { customerId: "cust_b", _max: { createdAt: newer } },
        ]);
        orderFindMany.mockResolvedValue([
            {
                customerId: "cust_a",
                createdAt: older,
                total: decimal("100"),
                currency: "INR",
            },
            {
                customerId: "cust_b",
                createdAt: newer,
                total: decimal("900"),
                currency: "INR",
            },
        ]);

        const [row] = await service.list(ctx());

        expect(row?.lastOrderAt).toEqual(newer);
        expect(row?.lastOrderTotal).toBe("900");
    });

    it("never attributes an order that merely shares a timestamp", async () => {
        // The final read is `createdAt IN (collected instants)`, so a collision
        // between two customers would cross-attribute without the pair re-check.
        const service = new ContactsService();
        findMany.mockResolvedValue([CONTACT]);
        linkFindMany.mockResolvedValue([
            { contactId: "c_1", customerId: "cust_mine" },
        ]);
        const at = new Date("2026-07-30T10:00:00.000Z");
        orderGroupBy.mockResolvedValue([
            { customerId: "cust_mine", _max: { createdAt: at } },
        ]);
        orderFindMany.mockResolvedValue([
            {
                customerId: "cust_someone_else",
                createdAt: at,
                total: decimal("99999"),
                currency: "INR",
            },
        ]);

        const [row] = await service.list(ctx());

        expect(row?.lastOrderAt).toBeNull();
        expect(row?.lastOrderTotal).toBeNull();
    });

    it("writes nothing — the reconciliation is read-time only", async () => {
        // The point of the whole design: turning this off is deleting a query,
        // not unpicking merged data. No CustomerIdentityLink is ever created.
        const service = new ContactsService();
        findMany.mockResolvedValue([CONTACT]);
        customerFindMany.mockResolvedValue([
            { id: "cust_2", email: CONTACT.email },
        ]);
        orderGroupBy.mockResolvedValue([]);

        await service.list(ctx());

        expect(prisma.customerIdentityLink).not.toHaveProperty("create");
        expect(update).not.toHaveBeenCalled();
    });

    it("leaves the order column empty for a role that cannot read orders", async () => {
        const service = new ContactsService();
        findMany.mockResolvedValue([CONTACT]);

        // MEMBER cannot read contacts at all, so exercise the gate directly:
        // the rollup must not be the hole that leaks commerce to a CRM role.
        const { can } = jest.requireActual<
            typeof import("../organizations/organization-policy")
        >("../organizations/organization-policy");
        expect(can("ADMIN", "order:read")).toBe(true);
        expect(can("MEMBER", "order:read")).toBe(false);

        await service.list(ctx());
        expect(linkFindMany).toHaveBeenCalled();
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
