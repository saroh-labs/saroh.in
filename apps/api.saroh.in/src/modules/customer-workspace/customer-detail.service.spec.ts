import { NotFoundException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { OrgAction } from "../organizations/organization-actions";
import { CustomerDetailService } from "./customer-detail.service";

/**
 * One read of a customer (U8): rooted on the contact, orders only through a
 * confirmed link, exact-email store customers only as possible matches, each
 * source degrading on its own, and no money for a role that reads none.
 */

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const MEMBER: OrganizationContext = { ...OWNER, role: "MEMBER" };

const FUTURE = new Date(Date.now() + 7 * 86_400_000);
const PAST = new Date(Date.now() - 7 * 86_400_000);
const LONG_AGO = new Date("2026-01-01T00:00:00Z");

const BAKERY = { id: "store_1", name: "Rye & Co." };

const LINK = {
    id: "link_1",
    createdAt: LONG_AGO,
    customer: {
        id: "cust_1",
        email: "asha@example.com",
        firstName: "Asha",
        lastName: "Rao",
        store: BAKERY,
    },
};

const ORDER = {
    id: "ord_1",
    orderId: "ORD-001",
    customerId: "cust_1",
    createdAt: PAST,
    status: "DELIVERED",
    paymentStatus: "PAID",
    total: "450",
    currency: "INR",
    store: BAKERY,
    _count: { items: 3 },
};

const BOOKING = {
    id: "bk_1",
    startAt: FUTURE,
    endAt: new Date(FUTURE.getTime() + 3_600_000),
    timezone: "Asia/Kolkata",
    status: "CONFIRMED",
    outcome: null,
    service: { id: "svc_1", name: "Spin class" },
    packRedemption: { reversedAt: null },
};

const SUBSCRIPTION = {
    id: "sub_1",
    status: "ACTIVE",
    interval: "MONTH",
    price: "1200",
    currency: "INR",
    currentPeriodStart: PAST,
    currentPeriodEnd: FUTURE,
    cancelAtPeriodEnd: false,
    pausedAt: null,
    cancelledAt: null,
    plan: { id: "plan_1", name: "Sourdough weekly" },
};

const PACK = {
    id: "pp_1",
    credits: 10,
    price: "3000",
    currency: "INR",
    expiresAt: FUTURE,
    pack: { id: "pack_1", name: "10 classes" },
    _count: { redemptions: 4 },
};

const INVOICE = {
    id: "inv_1",
    number: "INV-0001",
    status: "PAID",
    source: "SUBSCRIPTION",
    total: "1200",
    currency: "INR",
    issuedAt: PAST,
    dueAt: PAST,
    paidAt: PAST,
};

type Views = { key: string; readiness: string }[];
const ALL_ON: Views = ["CRM", "COMMERCE", "APPOINTMENTS", "PAYMENTS"].map(
    (key) => ({ key, readiness: "ACTIVE" }),
);

function make(views: Views = ALL_ON) {
    const db = {
        contact: {
            findFirst: jest.fn().mockResolvedValue({
                id: "c1",
                firstName: "Asha",
                lastName: "Rao",
                email: "asha@example.com",
                phone: null,
                company: null,
                source: null,
                createdAt: LONG_AGO,
            }),
        },
        contactNote: {
            findMany: jest.fn().mockResolvedValue([
                {
                    id: "note_1",
                    body: "Severe nut allergy",
                    createdByUserId: "user_1",
                    createdAt: PAST,
                    updatedAt: PAST,
                    allergens: [{ allergen: { id: "alg_nuts", name: "Nuts" } }],
                },
            ]),
        },
        customerIdentityLink: {
            findMany: jest.fn().mockResolvedValue([LINK]),
        },
        customer: { findMany: jest.fn().mockResolvedValue([]) },
        order: {
            findMany: jest.fn().mockResolvedValue([ORDER]),
            count: jest.fn().mockResolvedValue(1),
            groupBy: jest
                .fn()
                .mockResolvedValue([
                    { currency: "INR", _sum: { total: "450" } },
                ]),
        },
        booking: {
            findMany: jest
                .fn()
                .mockImplementation(({ where }) =>
                    Promise.resolve(where.startAt.gte ? [BOOKING] : []),
                ),
            count: jest
                .fn()
                .mockImplementation(({ where }) =>
                    Promise.resolve(
                        where.outcome === "ATTENDED"
                            ? 5
                            : where.outcome === "NO_SHOW"
                              ? 1
                              : 7,
                    ),
                ),
        },
        customerSubscription: {
            findMany: jest.fn().mockResolvedValue([SUBSCRIPTION]),
        },
        invoice: {
            findMany: jest.fn().mockImplementation(({ where }) =>
                Promise.resolve(
                    where.status === "ISSUED"
                        ? [
                              {
                                  status: "ISSUED",
                                  dueAt: PAST,
                                  total: "300",
                                  currency: "INR",
                              },
                          ]
                        : [INVOICE],
                ),
            ),
            groupBy: jest
                .fn()
                .mockResolvedValue([
                    { currency: "INR", _sum: { total: "1200" } },
                ]),
        },
        packPurchase: { findMany: jest.fn().mockResolvedValue([PACK]) },
    };
    const availability = {
        listViews: jest.fn().mockResolvedValue(views),
    } as unknown as ModuleAvailabilityService;
    return { svc: new CustomerDetailService(availability, db as never), db };
}

describe("CustomerDetailService", () => {
    it("returns every block, each tagged with where it came from", async () => {
        const { svc } = make();

        const detail = await svc.detail(OWNER, "c1");

        expect(detail.contact.name).toBe("Asha Rao");
        expect(detail.money).toBe(true);
        expect(detail.unavailable).toEqual([]);

        expect(detail.orders?.from).toBe("linked-customers");
        expect(detail.orders?.rows).toEqual([
            expect.objectContaining({
                number: "ORD-001",
                total: "450.00",
                itemCount: 3,
                via: { customerId: "cust_1", storefront: BAKERY },
            }),
        ]);
        expect(detail.linkedCustomers).toEqual([
            expect.objectContaining({
                linkId: "link_1",
                customerId: "cust_1",
                storefront: BAKERY,
            }),
        ]);
        expect(detail.subscriptions?.from).toBe("contact");
        expect(detail.subscriptions?.rows[0]).toEqual(
            expect.objectContaining({
                price: "1200.00",
                nextChargeAt: FUTURE.toISOString(),
            }),
        );
        expect(detail.packs?.rows[0]).toEqual(
            expect.objectContaining({ left: 6, standing: "ACTIVE" }),
        );
        expect(detail.bookings?.upcoming[0]).toEqual(
            expect.objectContaining({ id: "bk_1", paidWithPack: true }),
        );
        expect(detail.invoices?.rows[0].standing).toBe("PAID");
        expect(detail.notes?.rows[0].body).toBe("Severe nut allergy");
        expect(detail.allergens).toEqual([{ id: "alg_nuts", name: "Nuts" }]);

        expect(detail.stats).toEqual({
            orders: 1,
            bookings: 7,
            attended: 5,
            noShows: 1,
            lateCancels: null,
            classesLeft: {
                total: 6,
                packs: 6,
                membership: null,
                nextExpiry: FUTURE.toISOString(),
            },
            // Paid orders plus paid invoices, each rupee once.
            spent: [{ currency: "INR", amount: "1650.00" }],
            owed: {
                totals: [{ currency: "INR", amount: "300.00" }],
                unpaidCount: 1,
                overdueCount: 1,
            },
        });
    });

    it("offers an unlinked same-email store customer only as a possible match", async () => {
        const { svc, db } = make();
        db.customerIdentityLink.findMany.mockResolvedValue([]);
        db.customer.findMany.mockResolvedValue([
            {
                id: "cust_2",
                email: "ASHA@example.com",
                firstName: "Asha",
                lastName: null,
                store: BAKERY,
            },
        ]);

        const detail = await svc.detail(OWNER, "c1");

        expect(detail.possibleMatches).toEqual([
            { customerId: "cust_2", name: "Asha", storefront: BAKERY },
        ]);
        // None of their data: no orders read, no orders counted, no money.
        expect(db.order.findMany).not.toHaveBeenCalled();
        expect(db.order.groupBy).not.toHaveBeenCalled();
        expect(detail.orders?.rows).toEqual([]);
        expect(detail.stats.orders).toBe(0);
        expect(detail.stats.spent).toEqual([
            { currency: "INR", amount: "1200.00" },
        ]);
        // Matched on the exact email, in this organization only.
        expect(db.customer.findMany.mock.calls[0][0].where).toEqual(
            expect.objectContaining({
                organizationId: "org_1",
                email: { equals: "asha@example.com", mode: "insensitive" },
            }),
        );
    });

    it("never offers a customer who is already linked as a possible match", async () => {
        const { svc, db } = make();

        await svc.detail(OWNER, "c1");

        expect(db.customer.findMany.mock.calls[0][0].where.id).toEqual({
            notIn: ["cust_1"],
        });
    });

    it("reads a gym contact with no storefront: bookings, membership, packs", async () => {
        const { svc, db } = make(
            ALL_ON.map((v) =>
                v.key === "COMMERCE" ? { ...v, readiness: "DISABLED" } : v,
            ),
        );

        const detail = await svc.detail(OWNER, "c1");

        expect(detail).not.toHaveProperty("orders");
        expect(detail).not.toHaveProperty("linkedCustomers");
        expect(detail).not.toHaveProperty("possibleMatches");
        expect(detail.stats).not.toHaveProperty("orders");
        expect(db.customerIdentityLink.findMany).not.toHaveBeenCalled();
        expect(db.customer.findMany).not.toHaveBeenCalled();

        expect(detail.bookings?.upcoming).toHaveLength(1);
        expect(detail.subscriptions?.rows[0].plan.name).toBe(
            "Sourdough weekly",
        );
        expect(detail.packs?.rows).toHaveLength(1);
        expect(detail.stats.classesLeft?.total).toBe(6);
        expect(detail.stats.spent).toEqual([
            { currency: "INR", amount: "1200.00" },
        ]);
    });

    it("gives a Member no money and no billing blocks", async () => {
        const { svc, db } = make();

        const detail = await svc.detail(MEMBER, "c1");

        expect(detail.money).toBe(false);
        expect(detail).not.toHaveProperty("invoices");
        expect(detail).not.toHaveProperty("subscriptions");
        expect(detail).not.toHaveProperty("packs");
        // DEC-020: no orders either — a Member reads the diary, not the till.
        expect(detail).not.toHaveProperty("orders");
        expect(detail.stats).not.toHaveProperty("spent");
        expect(detail.stats).not.toHaveProperty("owed");
        expect(detail.stats).not.toHaveProperty("classesLeft");
        expect(db.invoice.findMany).not.toHaveBeenCalled();
        expect(db.invoice.groupBy).not.toHaveBeenCalled();
        expect(db.customerSubscription.findMany).not.toHaveBeenCalled();
        expect(db.packPurchase.findMany).not.toHaveBeenCalled();
        expect(db.order.groupBy).not.toHaveBeenCalled();

        // What they do see: the diary, and the notes (an allergy matters at
        // the counter).
        expect(detail.bookings?.upcoming).toHaveLength(1);
        expect(detail.stats.bookings).toBe(7);
        expect(detail.allergens).toEqual([{ id: "alg_nuts", name: "Nuts" }]);
        expect(JSON.stringify(detail)).not.toMatch(/"(total|price|amount)"/);
    });

    it("leaves money out of rows a moneyless custom role may read", async () => {
        const { svc, db } = make();
        const clerk: OrganizationContext = {
            ...OWNER,
            role: "MEMBER",
            roleKey: "clerk",
            actions: new Set<OrgAction>([
                "contact:read",
                "order:read",
                "pack:read",
            ]),
        };

        const detail = await svc.detail(clerk, "c1");

        expect(detail.orders?.rows[0]).not.toHaveProperty("total");
        expect(detail.packs?.rows[0]).not.toHaveProperty("price");
        expect(detail.stats).not.toHaveProperty("spent");
        expect(db.order.groupBy).not.toHaveBeenCalled();
    });

    it("returns the rest when the packs read throws, naming packs", async () => {
        const { svc, db } = make();
        db.packPurchase.findMany.mockRejectedValue(new Error("timeout"));

        const detail = await svc.detail(OWNER, "c1");

        expect(detail.packs).toBeNull();
        expect(detail.stats.classesLeft).toBeNull();
        expect(detail.unavailable).toEqual([
            { source: "packs", label: "Class packs" },
        ]);
        expect(detail.orders?.rows).toHaveLength(1);
        expect(detail.subscriptions?.rows).toHaveLength(1);
        expect(detail.bookings?.upcoming).toHaveLength(1);
        // Packs do not feed spent, so spent still stands.
        expect(detail.stats.spent).toEqual([
            { currency: "INR", amount: "1650.00" },
        ]);
    });

    it("does not state spent when a source it sums failed", async () => {
        const { svc, db } = make();
        db.order.findMany.mockRejectedValue(new Error("boom"));

        const detail = await svc.detail(OWNER, "c1");

        expect(detail.orders).toBeNull();
        expect(detail.stats.orders).toBeNull();
        expect(detail.stats.spent).toBeNull();
        expect(detail.stats.owed?.unpaidCount).toBe(1);
        expect(detail.unavailable.map((u) => u.source)).toEqual(["orders"]);
    });

    it("names orders and possible matches when the links cannot be read", async () => {
        const { svc, db } = make();
        db.customerIdentityLink.findMany.mockRejectedValue(new Error("down"));

        const detail = await svc.detail(OWNER, "c1");

        expect(detail.linkedCustomers).toBeNull();
        expect(detail.orders).toBeNull();
        expect(detail.possibleMatches).toBeNull();
        expect(db.order.findMany).not.toHaveBeenCalled();
        expect(detail.unavailable.map((u) => u.source).sort()).toEqual([
            "linkedCustomers",
            "orders",
            "possibleMatches",
        ]);
        expect(detail.bookings?.upcoming).toHaveLength(1);
    });

    it("is a 404 for a contact in another organization", async () => {
        const { svc, db } = make();
        db.contact.findFirst.mockResolvedValue(null);

        await expect(svc.detail(OWNER, "c_other")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(db.contact.findFirst.mock.calls[0][0].where).toEqual({
            id: "c_other",
            organizationId: "org_1",
        });
    });

    it("refuses a role that cannot read contacts", async () => {
        const { svc } = make();

        await expect(
            svc.detail({ ...OWNER, role: "REVIEWER" }, "c1"),
        ).rejects.toThrow(/contact:read/);
    });
});
