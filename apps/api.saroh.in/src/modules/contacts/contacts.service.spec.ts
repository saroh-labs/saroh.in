// DB-free unit tests: the database package is mocked so nothing touches a real
// Postgres. The lead/booking delegates are here because the list rollup reads
// them — see ContactListItem.
jest.mock("@saroh/database", () => {
    return {
        prisma: {
            contact: {
                findMany: jest.fn(),
                findUnique: jest.fn(),
                findFirst: jest.fn(),
                update: jest.fn(),
                create: jest.fn(),
                delete: jest.fn(),
            },
            lead: { groupBy: jest.fn(), count: jest.fn() },
            // A contact's detail carries what they wrote (UX-002).
            submission: { findMany: jest.fn().mockResolvedValue([]) },
            // Either form: a batch resolves each queued call in order, and a
            // callback runs against the same mocked client.
            $transaction: jest.fn((arg: unknown) =>
                typeof arg === "function"
                    ? (arg as (tx: unknown) => unknown)(
                          jest.requireMock("@saroh/database").prisma,
                      )
                    : Promise.all(arg as Promise<unknown>[]),
            ),
            booking: {
                groupBy: jest.fn(),
                findMany: jest.fn(),
                updateMany: jest.fn(),
            },
            bookingEvent: { createMany: jest.fn() },
            customerSubscription: { count: jest.fn() },
            packPurchase: { count: jest.fn() },
            courseEnrollment: { count: jest.fn(), deleteMany: jest.fn() },
            // A delete counts their orders and invoices first (DEC-042).
            invoice: {
                updateMany: jest.fn(),
                count: jest.fn().mockResolvedValue(0),
            },
            auditEvent: { create: jest.fn() },
            customerIdentityLink: { findMany: jest.fn() },
            customer: { findMany: jest.fn() },
            order: {
                groupBy: jest.fn(),
                findMany: jest.fn(),
                count: jest.fn().mockResolvedValue(0),
            },
            // D20: a delete asks about autopay first, under the contact's lock.
            paymentMandate: { findFirst: jest.fn().mockResolvedValue(null) },
            $queryRaw: jest.fn().mockResolvedValue([]),
        },
    };
});

import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ContactsService } from "./contacts.service";

const findMany = prisma.contact.findMany as jest.Mock;
const findUnique = prisma.contact.findUnique as jest.Mock;
const update = prisma.contact.update as jest.Mock;
const findFirst = prisma.contact.findFirst as jest.Mock;
const auditCreate = prisma.auditEvent.create as jest.Mock;
const create = prisma.contact.create as jest.Mock;
const leadGroupBy = prisma.lead.groupBy as jest.Mock;
const bookingGroupBy = prisma.booking.groupBy as jest.Mock;
const linkFindMany = prisma.customerIdentityLink.findMany as jest.Mock;
const customerFindMany = prisma.customer.findMany as jest.Mock;
const orderGroupBy = prisma.order.groupBy as jest.Mock;
const orderFindMany = prisma.order.findMany as jest.Mock;
const contactDelete = prisma.contact.delete as jest.Mock;
const leadCount = prisma.lead.count as jest.Mock;
const subCount = prisma.customerSubscription.count as jest.Mock;
const packCount = prisma.packPurchase.count as jest.Mock;
const courseCount = prisma.courseEnrollment.count as jest.Mock;
const bookingFindMany = prisma.booking.findMany as jest.Mock;
const bookingUpdateMany = prisma.booking.updateMany as jest.Mock;
const eventCreateMany = prisma.bookingEvent.createMany as jest.Mock;
const invoiceUpdateMany = prisma.invoice.updateMany as jest.Mock;

/** A Prisma Decimal serialises via `toString`; the mock must do the same. */
const decimal = (v: string) => ({ toString: () => v });

const CONTACT = {
    id: "c_1",
    organizationId: "org_1",
    email: "ananya@example.com",
    firstName: "Ananya",
    lastName: "Rao",
    // The list's include: their live site account, if any (UX-013).
    customerAccounts: [] as { email: string }[],
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

        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    mergedIntoId: null,
                    removedAt: null,
                },
                orderBy: { createdAt: "desc" },
            }),
        );
    });

    it("denies a REVIEWER (website only) before any I/O", async () => {
        const service = new ContactsService();
        await expect(
            service.list(ctx({ role: "REVIEWER" })),
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

    it("carries the email their site account signs in with, and drops the include (UX-013)", async () => {
        const service = new ContactsService();
        findMany.mockResolvedValue([
            {
                ...CONTACT,
                email: "account+c_1@account.invalid",
                customerAccounts: [{ email: "ananya@example.com" }],
            },
            { ...CONTACT, id: "c_2" },
        ]);

        const [separate, plain] = await service.list(ctx());

        expect(separate?.accountEmail).toBe("ananya@example.com");
        expect(plain?.accountEmail).toBeNull();
        expect(separate).not.toHaveProperty("customerAccounts");
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                include: {
                    customerAccounts: expect.objectContaining({
                        where: { status: "ACTIVE" },
                    }),
                },
            }),
        );
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

        // The rollup must not be the hole that leaks commerce to a role
        // without `order:read`.
        const { can } = jest.requireActual<
            typeof import("../organizations/organization-policy")
        >("../organizations/organization-policy");
        expect(can("ADMIN", "order:read")).toBe(true);
        expect(can("MEMBER", "order:read")).toBe(false);

        await service.list(ctx());
        expect(linkFindMany).toHaveBeenCalled();
    });

    it("gives a Member the diary but no pipeline and no orders", async () => {
        // DEC-020: a Member reads the people on the diary. Nothing here may
        // carry a lead's value or what someone has bought.
        const service = new ContactsService();
        findMany.mockResolvedValue([CONTACT]);
        bookingGroupBy.mockResolvedValue([
            { contactId: "c_1", _min: { startAt: new Date("2026-10-01") } },
        ]);

        const [row] = await service.list(ctx({ role: "MEMBER" }));

        expect(row?.nextBookingAt).not.toBeNull();
        expect(row?.openLeadCount).toBe(0);
        expect(row?.openLeadValue).toBeNull();
        expect(row?.lastOrderAt).toBeNull();
        expect(leadGroupBy).not.toHaveBeenCalled();
        expect(orderGroupBy).not.toHaveBeenCalled();
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
            customerAccounts: [],
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

    it("names the email their site account signs in with (UX-013)", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue({
            id: "c_1",
            organizationId: "org_1",
            email: "account+c_1@account.invalid",
            leads: [],
            customerAccounts: [{ email: "priya@example.in" }],
        });

        const res = await service.get(ctx(), "c_1");

        expect(res.accountEmail).toBe("priya@example.in");
        expect(res).not.toHaveProperty("customerAccounts");
    });

    it("asks for no leads when the role cannot read them", async () => {
        // The leak this test exists for: `get` used to include every lead
        // unconditionally, so a Member opening a contact saw the pipeline.
        const service = new ContactsService();
        findUnique.mockResolvedValue({
            id: "c_1",
            organizationId: "org_1",
            leads: [],
            customerAccounts: [],
        });

        const res = await service.get(ctx({ role: "MEMBER" }), "c_1");

        expect(res.id).toBe("c_1");
        const include = findUnique.mock.calls[0]?.[0]?.include;
        expect(include.leads).toMatchObject({ where: { id: { in: [] } } });
        // Nor what they wrote through a form: an enquiry is sales data.
        expect(res.enquiries).toEqual([]);
        expect(prisma.submission.findMany).not.toHaveBeenCalled();
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
        findUnique.mockResolvedValue({ ...CONTACT, company: null });
        update.mockResolvedValue({ id: "c_1" });

        await service.update(ctx(), "c_1", { company: "Acme" });

        expect(update).toHaveBeenCalledWith({
            where: { id: "c_1" },
            data: { company: "Acme" },
        });
    });

    it("changes the email, clears its stamp and notes it on the timeline (C8)", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue({
            ...CONTACT,
            emailVerifiedAt: new Date(),
            emailVerifiedVia: "SIGN_IN_CODE",
        });
        findFirst.mockResolvedValue(null);
        update.mockResolvedValue({ id: "c_1" });

        await service.update(ctx(), "c_1", {
            email: "ananya.rao@gmail.com",
            addressLine1: "12 Hill Road",
            city: "Bengaluru",
            postalCode: "560038",
            country: "IN",
        });

        expect(findFirst).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                id: { not: "c_1" },
                email: { equals: "ananya.rao@gmail.com", mode: "insensitive" },
            },
            select: { id: true, firstName: true, lastName: true },
        });
        expect(update).toHaveBeenCalledWith({
            where: { id: "c_1" },
            data: expect.objectContaining({
                email: "ananya.rao@gmail.com",
                emailVerifiedAt: null,
                emailVerifiedVia: null,
                addressLine1: "12 Hill Road",
                postalCode: "560038",
            }),
        });
        expect(auditCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: "customer.details.changed",
                targetType: "contact",
                targetId: "c_1",
                // Names only, never the address or email itself (DEC-035).
                metadata: { fields: ["email", "address"] },
            }),
        });
    });

    it("refuses an email another contact holds with a 409 naming them", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue(CONTACT);
        findFirst.mockResolvedValue({
            id: "c_2",
            firstName: "Priya",
            lastName: "R",
        });

        const err = await service
            .update(ctx(), "c_1", { email: "priya@example.com" })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toMatchObject({
            details: { field: "email", contactId: "c_2", name: "Priya R" },
        });
        expect(update).not.toHaveBeenCalled();
    });

    it("answers a lost race for the email with the same 409", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue(CONTACT);
        findFirst.mockResolvedValue(null);
        update.mockRejectedValue(
            Object.assign(new Error("unique"), { code: "P2002" }),
        );

        await expect(
            service.update(ctx(), "c_1", { email: "priya@example.com" }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("writes nothing when nothing changes", async () => {
        const service = new ContactsService();
        findUnique.mockResolvedValue(CONTACT);

        const out = await service.update(ctx(), "c_1", {
            firstName: "Ananya",
            email: "ananya@example.com",
        });

        expect(out).toEqual(CONTACT);
        expect(update).not.toHaveBeenCalled();
        expect(auditCreate).not.toHaveBeenCalled();
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

describe("ContactsService.create", () => {
    beforeEach(() => jest.clearAllMocks());

    it("adds someone by hand, in the caller's org, marked as manual", async () => {
        findUnique.mockResolvedValue(null);
        create.mockResolvedValue({ id: "c_new" });
        await new ContactsService().create(ctx(), {
            email: "meera@example.com",
            firstName: "Meera",
            phone: "  ",
        });
        expect(create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                email: "meera@example.com",
                firstName: "Meera",
                lastName: null,
                phone: null,
                company: null,
                source: "manual",
            },
        });
    });

    it("refuses an email already in the org, naming who has it", async () => {
        findUnique.mockResolvedValue({ id: "c_1" });
        await expect(
            new ContactsService().create(ctx(), {
                email: "ananya@example.com",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(create).not.toHaveBeenCalled();
    });

    it("refuses a role that may not write contacts", async () => {
        await expect(
            new ContactsService().create(ctx({ role: "REVIEWER" }), {
                email: "x@example.com",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(create).not.toHaveBeenCalled();
    });
});

describe("ContactsService.remove", () => {
    beforeEach(() => jest.clearAllMocks());

    beforeEach(() => {
        subCount.mockResolvedValue(0);
        packCount.mockResolvedValue(0);
        courseCount.mockResolvedValue(0);
        bookingFindMany.mockResolvedValue([]);
        linkFindMany.mockResolvedValue([]);
    });

    describe("someone with orders or invoices (DEC-042)", () => {
        const orderCount = prisma.order.count as jest.Mock;
        const invoiceCount = prisma.invoice.count as jest.Mock;
        afterEach(() => {
            orderCount.mockResolvedValue(0);
            invoiceCount.mockResolvedValue(0);
        });

        it("refuses with the merchant's words when they have an invoice, and touches nothing", async () => {
            findUnique.mockResolvedValue({
                id: "c_1",
                organizationId: "org_1",
            });
            invoiceCount.mockResolvedValue(1);
            const cancelFor = jest.fn();
            const service = new ContactsService({
                cancelFor,
            } as unknown as ConstructorParameters<typeof ContactsService>[0]);

            await expect(service.remove(ctx(), "c_1")).rejects.toMatchObject({
                status: 409,
                response: {
                    message:
                        "They have orders or invoices. Remove their details instead.",
                    details: {
                        reason: "keeps_records",
                        orders: 0,
                        invoices: 1,
                    },
                },
            });
            // Refused before autopay was asked to end, or anything went.
            expect(cancelFor).not.toHaveBeenCalled();
            expect(contactDelete).not.toHaveBeenCalled();
            expect(invoiceUpdateMany).not.toHaveBeenCalled();
            expect(invoiceCount).toHaveBeenCalledWith({
                where: {
                    organizationId: "org_1",
                    NOT: {
                        source: { in: ["BOOKING", "PACK", "SUBSCRIPTION"] },
                        number: null,
                    },
                    OR: [{ contactId: "c_1" }],
                },
            });
        });

        it("counts real orders through their linked store customers", async () => {
            findUnique.mockResolvedValue({
                id: "c_1",
                organizationId: "org_1",
            });
            linkFindMany.mockResolvedValue([{ customerId: "cu_1" }]);
            orderCount.mockResolvedValue(2);

            await expect(
                new ContactsService().remove(ctx(), "c_1"),
            ).rejects.toMatchObject({
                response: {
                    details: { reason: "keeps_records", orders: 2 },
                },
            });
            expect(orderCount).toHaveBeenCalledWith({
                where: expect.objectContaining({
                    customerId: { in: ["cu_1"] },
                    // Never an abandoned site checkout.
                    NOT: expect.objectContaining({ placedOnline: true }),
                }),
            });
            // The invoices of those orders count too.
            expect(invoiceCount).toHaveBeenCalledWith({
                where: expect.objectContaining({
                    OR: [
                        { contactId: "c_1" },
                        { order: { customerId: { in: ["cu_1"] } } },
                    ],
                }),
            });
            expect(contactDelete).not.toHaveBeenCalled();
        });

        it("checks again under the contact's lock, for an invoice issued meanwhile", async () => {
            findUnique.mockResolvedValue({
                id: "c_1",
                organizationId: "org_1",
            });
            leadCount.mockResolvedValue(0);
            invoiceCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

            await expect(
                new ContactsService().remove(ctx(), "c_1"),
            ).rejects.toBeInstanceOf(ConflictException);
            expect(invoiceCount).toHaveBeenCalledTimes(2);
            expect(contactDelete).not.toHaveBeenCalled();
        });
    });

    it("deletes an owned contact and says how many leads went with them", async () => {
        findUnique.mockResolvedValue({ id: "c_1", organizationId: "org_1" });
        leadCount.mockResolvedValue(2);
        contactDelete.mockResolvedValue({ id: "c_1" });

        await expect(
            new ContactsService().remove(ctx(), "c_1"),
        ).resolves.toEqual({
            id: "c_1",
            deleted: true,
            leads: 2,
            subscriptions: 0,
            packs: 0,
            courses: 0,
            bookingsCancelled: 0,
        });
        expect(leadCount).toHaveBeenCalledWith({ where: { contactId: "c_1" } });
        expect(contactDelete).toHaveBeenCalledWith({ where: { id: "c_1" } });
        expect(bookingUpdateMany).not.toHaveBeenCalled();
    });

    it("revokes the pay links on their invoices before the contact goes (U13)", async () => {
        findUnique.mockResolvedValue({ id: "c_1", organizationId: "org_1" });
        leadCount.mockResolvedValue(0);
        contactDelete.mockResolvedValue({ id: "c_1" });

        await new ContactsService().remove(ctx(), "c_1");

        expect(invoiceUpdateMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                contactId: "c_1",
                payTokenHash: { not: null },
            },
            data: { payTokenHash: null, payLinkCreatedAt: null },
        });
        const [revoked] = invoiceUpdateMany.mock.invocationCallOrder;
        const [deleted] = contactDelete.mock.invocationCallOrder;
        expect(revoked).toBeLessThan(deleted ?? 0);
    });

    it("says what they held, and cancels their pack-paid bookings and course sessions to come", async () => {
        findUnique.mockResolvedValue({ id: "c_1", organizationId: "org_1" });
        leadCount.mockResolvedValue(0);
        subCount.mockResolvedValue(1);
        packCount.mockResolvedValue(2);
        courseCount.mockResolvedValue(1);
        const startAt = new Date("2099-01-01T09:00:00Z");
        bookingFindMany.mockResolvedValue([{ id: "bk_1", startAt }]);

        await expect(
            new ContactsService().remove(ctx(), "c_1"),
        ).resolves.toMatchObject({
            subscriptions: 1,
            packs: 2,
            courses: 1,
            bookingsCancelled: 1,
        });
        expect(bookingFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    organizationId: "org_1",
                    status: "CONFIRMED",
                    OR: [
                        {
                            packRedemption: {
                                reversedAt: null,
                                purchase: { contactId: "c_1" },
                            },
                        },
                        {
                            courseEnrollment: {
                                contactId: "c_1",
                                status: "ACTIVE",
                            },
                        },
                    ],
                }),
            }),
        );
        expect(bookingUpdateMany).toHaveBeenCalledWith({
            where: { id: { in: ["bk_1"] } },
            data: { status: "CANCELLED", cancelledAt: expect.any(Date) },
        });
        expect(eventCreateMany).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    bookingId: "bk_1",
                    type: "CANCELLED",
                    fromStartAt: startAt,
                }),
            ],
        });
        expect(bookingUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
            contactDelete.mock.invocationCallOrder[0]!,
        );
    });

    it("404s a cross-tenant contact and deletes nothing", async () => {
        findUnique.mockResolvedValue({
            id: "c_1",
            organizationId: "org_OTHER",
        });
        await expect(
            new ContactsService().remove(ctx(), "c_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(contactDelete).not.toHaveBeenCalled();
    });

    it("refuses a role without contact:write", async () => {
        await expect(
            new ContactsService().remove(ctx({ role: "MEMBER" }), "c_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(contactDelete).not.toHaveBeenCalled();
    });

    describe("their autopay (D20)", () => {
        const mandateFindFirst = prisma.paymentMandate.findFirst as jest.Mock;
        afterEach(() => mandateFindFirst.mockResolvedValue(null));

        it("cancels it at the provider through cancelFor before the delete", async () => {
            findUnique.mockResolvedValue({
                id: "c_1",
                organizationId: "org_1",
            });
            leadCount.mockResolvedValue(0);
            contactDelete.mockResolvedValue({ id: "c_1" });
            // Open before the cancel, confirmed after it.
            mandateFindFirst
                .mockResolvedValueOnce({ provider: "razorpay" })
                .mockResolvedValueOnce(null);
            const cancelFor = jest.fn().mockResolvedValue({
                cancelled: 1,
                awaitingProvider: 1,
                unconfirmed: 0,
            });
            const service = new ContactsService({
                cancelFor,
            } as unknown as ConstructorParameters<typeof ContactsService>[0]);

            await service.remove(ctx(), "c_1");

            expect(cancelFor).toHaveBeenCalledWith(
                { organizationId: "org_1", contactId: "c_1" },
                "STAFF",
            );
            const [asked] = cancelFor.mock.invocationCallOrder;
            const [deleted] = contactDelete.mock.invocationCallOrder;
            expect(asked).toBeLessThan(deleted ?? 0);
        });

        it("refuses while the provider hasn't confirmed, and deletes nothing", async () => {
            findUnique.mockResolvedValue({
                id: "c_1",
                organizationId: "org_1",
            });
            mandateFindFirst.mockResolvedValue({ provider: "razorpay" });
            const cancelFor = jest.fn().mockResolvedValue({
                cancelled: 0,
                awaitingProvider: 0,
                unconfirmed: 1,
            });
            const service = new ContactsService({
                cancelFor,
            } as unknown as ConstructorParameters<typeof ContactsService>[0]);

            await expect(service.remove(ctx(), "c_1")).rejects.toMatchObject({
                response: {
                    message:
                        "Their autopay couldn't be cancelled at Razorpay yet, so nothing was deleted. Try again in a few minutes",
                    details: { reason: "autopay" },
                },
            });
            expect(contactDelete).not.toHaveBeenCalled();
        });

        it("refuses an open mandate when it can't reach the provider at all", async () => {
            findUnique.mockResolvedValue({
                id: "c_1",
                organizationId: "org_1",
            });
            mandateFindFirst.mockResolvedValue({ provider: "razorpay" });

            await expect(
                new ContactsService().remove(ctx(), "c_1"),
            ).rejects.toBeInstanceOf(ConflictException);
            expect(contactDelete).not.toHaveBeenCalled();
        });
    });
});

describe("a contact whose details were removed (C11)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("can't be read or edited: it is a 404", async () => {
        findUnique.mockResolvedValue({
            ...CONTACT,
            removedAt: new Date("2026-09-28T00:00:00Z"),
            mergedIntoId: null,
        });
        await expect(
            new ContactsService().remove(ctx(), "c_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(contactDelete).not.toHaveBeenCalled();
    });

    it("is left out of the list", async () => {
        findMany.mockResolvedValue([]);
        await new ContactsService().list(ctx());
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    mergedIntoId: null,
                    removedAt: null,
                },
            }),
        );
    });
});
