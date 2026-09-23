import { BadRequestException, ForbiddenException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { CalendarService } from "./calendar.service";

/**
 * The Business Calendar's month (U4): each layer read on its own, a failed
 * one named while the rest return, layers and takings only for who may
 * read them, and days in the business's zone.
 */

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const MEMBER: OrganizationContext = { ...OWNER, role: "MEMBER" };

// The 20th: an invoice due on the 10th is overdue.
const NOW = new Date("2026-09-20T06:00:00Z");
const IST = "Asia/Kolkata";

const customer = { firstName: "Asha", lastName: "Rao", email: "a@x.in" };

function order(id: string, createdAt: string, over: object = {}) {
    return {
        id,
        orderId: id.toUpperCase(),
        status: "PROCESSING",
        paymentStatus: "PAID",
        total: "250",
        currency: "INR",
        createdAt: new Date(createdAt),
        customer,
        ...over,
    };
}

const SUBSCRIBER = {
    id: "sub_1",
    status: "ACTIVE",
    interval: "MONTH",
    timezone: IST,
    anchorAt: new Date("2026-08-05T18:30:00Z"),
    createdAt: new Date("2026-08-05T18:30:00Z"),
    // Its renewal on the 6th (IST) has run: the charge is the invoice below.
    currentPeriodEnd: new Date("2026-10-05T18:30:00Z"),
    cancelAtPeriodEnd: false,
    pausedAt: null,
    cancelledAt: null,
    collectionWeekday: null,
    collectionNote: null,
    price: "1200",
    currency: "INR",
    plan: { name: "Sourdough weekly" },
    contact: customer,
    skips: [],
};

const RENEWAL_CHARGE = {
    id: "inv_r",
    number: "INV-0007",
    status: "PAID",
    total: "1200",
    currency: "INR",
    dueAt: new Date("2026-09-12T18:30:00Z"),
    periodStart: new Date("2026-09-05T18:30:00Z"),
    subscription: {
        id: "sub_1",
        status: "ACTIVE",
        plan: { name: "Sourdough weekly" },
        contact: customer,
    },
};

const OVERDUE = {
    id: "inv_o",
    number: "INV-0003",
    status: "ISSUED",
    source: "MANUAL",
    total: "4000",
    currency: "INR",
    dueAt: new Date("2026-09-10T06:00:00Z"),
    paidAt: null,
    billToName: "Café Mocha",
    subscriptionId: null,
    contact: null,
};

interface Fixture {
    profileZone?: string | null;
    orders?: object[];
    collectionSubs?: object[];
    subs?: object[];
    subscriptionInvoices?: object[];
    invoices?: object[];
    bookings?: object[];
    classes?: object[];
    failInvoices?: boolean;
}

function build(
    modules: string[] = ["COMMERCE", "PAYMENTS", "APPOINTMENTS"],
    f: Fixture = {},
) {
    const availability = {
        listViews: jest
            .fn()
            .mockResolvedValue(
                modules.map((key) => ({ key, readiness: "ACTIVE" })),
            ),
    } as unknown as ModuleAvailabilityService;

    const invoiceRead = jest.fn((args: { where: { source?: string } }) => {
        if (args.where.source === "SUBSCRIPTION") {
            return Promise.resolve(f.subscriptionInvoices ?? []);
        }
        if (f.failInvoices) {
            return Promise.reject(new Error("invoices table is mid-migration"));
        }
        return Promise.resolve(f.invoices ?? []);
    });

    const db = {
        businessProfile: {
            findUnique: jest
                .fn()
                .mockResolvedValue(
                    f.profileZone === null
                        ? null
                        : { timezone: f.profileZone ?? IST },
                ),
        },
        service: { findFirst: jest.fn().mockResolvedValue(null) },
        order: { findMany: jest.fn().mockResolvedValue(f.orders ?? []) },
        customerSubscription: {
            findMany: jest.fn(
                (args: { where: { collectionWeekday?: unknown } }) =>
                    Promise.resolve(
                        args.where.collectionWeekday
                            ? (f.collectionSubs ?? [])
                            : (f.subs ?? []),
                    ),
            ),
        },
        invoice: { findMany: invoiceRead },
        booking: {
            findMany: jest.fn(
                (args: { where: { service: { capacity: { gt?: number } } } }) =>
                    Promise.resolve(
                        args.where.service.capacity.gt === undefined
                            ? (f.bookings ?? [])
                            : (f.classes ?? []),
                    ),
            ),
        },
    };
    const service = new CalendarService(
        availability,
        db as unknown as ConstructorParameters<typeof CalendarService>[1],
    );
    return { service, db, availability };
}

describe("CalendarService.month", () => {
    it("a month with orders, a renewal and an overdue invoice: per-day counts and one to act on", async () => {
        const { service } = build(undefined, {
            orders: [
                order("o1", "2026-09-05T04:00:00Z"),
                order("o2", "2026-09-05T08:00:00Z"),
                order("o3", "2026-09-05T12:00:00Z", {
                    paymentStatus: "UNPAID",
                }),
            ],
            subs: [SUBSCRIBER],
            subscriptionInvoices: [RENEWAL_CHARGE],
            invoices: [OVERDUE],
        });

        const res = await service.month(OWNER, "2026-09", NOW);

        expect(res.timezone).toBe(IST);
        expect(res.timezoneSource).toBe("business");
        expect(res.layers).toEqual([
            "orders",
            "collections",
            "subscriptions",
            "invoices",
            "bookings",
            "classes",
        ]);
        const day = (d: string) => res.days.find((x) => x.date === d)!;

        expect(day("2026-09-05").layers.orders?.count).toBe(3);
        expect(day("2026-09-06").layers.subscriptions).toMatchObject({
            count: 1,
            kinds: { renewal: 1 },
        });
        expect(day("2026-09-06").layers.subscriptions?.items[0].link).toEqual({
            type: "subscription",
            id: "sub_1",
        });
        expect(day("2026-09-10").layers.invoices?.kinds).toEqual({
            overdue: 1,
        });

        expect(res.toActOn).toEqual([
            expect.objectContaining({
                kind: "invoice_overdue",
                date: "2026-09-10",
                link: { type: "invoice", id: "inv_o" },
            }),
        ]);
        expect(day("2026-09-10").toActOn).toBe(1);

        // Two paid orders on the 5th; the unpaid one is not takings.
        expect(day("2026-09-05").takings).toEqual([
            { currency: "INR", amount: "500.00" },
        ]);
        expect(res.takings).toEqual({
            lead: "orders",
            total: [{ currency: "INR", amount: "500.00" }],
        });
        expect(res.totals).toMatchObject({ orders: 3, invoices: 1 });
        expect(res.unavailable).toEqual([]);
    });

    it("every day of the month is there, the empty ones with every layer at zero", async () => {
        const { service } = build(["COMMERCE"]);
        const res = await service.month(OWNER, "2026-02", NOW);
        expect(res.days).toHaveLength(28);
        for (const d of res.days) {
            expect(d.layers).toEqual({
                orders: { count: 0, kinds: {}, items: [] },
            });
            expect(d.takings).toEqual([]);
        }
    });

    it("reads the month between the business's midnights, and buckets in its zone", async () => {
        const { service, db } = build(["COMMERCE"], {
            // 00:30 on the 1st in India; still the 31st in UTC.
            orders: [order("o1", "2026-08-31T19:00:00Z")],
        });
        const res = await service.month(OWNER, "2026-09", NOW);

        expect(db.order.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    createdAt: {
                        gte: new Date("2026-08-31T18:30:00Z"),
                        lt: new Date("2026-09-30T18:30:00Z"),
                    },
                },
            }),
        );
        expect(res.days[0].date).toBe("2026-09-01");
        expect(res.days[0].layers.orders?.count).toBe(1);
        expect(res.from).toBe("2026-08-31T18:30:00.000Z");
    });

    it("names the zone it fell back to", async () => {
        const { service } = build(["COMMERCE"], { profileZone: null });
        const res = await service.month(OWNER, "2026-09", NOW);
        expect(res).toMatchObject({
            timezone: "Asia/Kolkata",
            timezoneSource: "fallback",
        });
    });

    it("a Member gets the diary, and no billing layers or takings — omitted, not refused", async () => {
        const { service, db } = build(undefined, {
            bookings: [
                {
                    id: "bk_1",
                    startAt: new Date("2026-09-08T04:30:00Z"),
                    status: "CONFIRMED",
                    outcome: null,
                    bookerName: null,
                    bookerEmail: null,
                    service: { name: "Physio" },
                    staff: { name: "Ravi" },
                    contact: customer,
                },
            ],
        });
        const res = await service.month(MEMBER, "2026-09", NOW);

        expect(res.layers).toEqual(["bookings", "classes"]);
        expect(res).not.toHaveProperty("takings");
        expect(res.days[7].layers.bookings?.items[0]).toMatchObject({
            title: "Asha Rao",
            subtitle: "Physio · Ravi",
            link: { type: "booking", id: "bk_1" },
        });
        for (const d of res.days) {
            expect(d).not.toHaveProperty("takings");
            expect(d.layers).not.toHaveProperty("invoices");
            expect(d.layers).not.toHaveProperty("subscriptions");
        }
        expect(db.invoice.findMany).not.toHaveBeenCalled();
        expect(db.customerSubscription.findMany).not.toHaveBeenCalled();
        expect(db.order.findMany).not.toHaveBeenCalled();
    });

    it("the invoices read throwing: the rest returns, invoices named, takings unknown", async () => {
        const { service } = build(undefined, {
            orders: [order("o1", "2026-09-05T04:00:00Z")],
            subs: [SUBSCRIBER],
            subscriptionInvoices: [RENEWAL_CHARGE],
            failInvoices: true,
        });
        const res = await service.month(OWNER, "2026-09", NOW);

        expect(res.unavailable).toEqual([
            { source: "invoices", label: "Invoices" },
        ]);
        expect(res.totals.invoices).toBeNull();
        expect(res.days[4].layers.orders?.count).toBe(1);
        expect(res.days[5].layers.subscriptions?.count).toBe(1);
        expect(res.takings).toEqual({ lead: "orders", total: null });
        expect(res.days[4]).not.toHaveProperty("takings");
    });

    it("a skipped collection is absent from the month", async () => {
        const collector = {
            ...SUBSCRIBER,
            interval: "WEEK",
            currentPeriodEnd: new Date("2026-09-25T18:30:00Z"),
            // Saturday.
            collectionWeekday: 6,
            collectionNote: "1 sourdough loaf",
            skips: [{ date: new Date("2026-09-12T00:00:00Z") }],
        };
        const { service } = build(["PAYMENTS"], {
            collectionSubs: [collector],
        });
        const res = await service.month(OWNER, "2026-09", NOW);

        const dates = res.days
            .filter((d) => (d.layers.collections?.count ?? 0) > 0)
            .map((d) => d.date);
        expect(dates).toEqual(["2026-09-05", "2026-09-19", "2026-09-26"]);
        expect(res.days[4].layers.collections?.items[0]).toMatchObject({
            title: "Asha Rao",
            subtitle: "1 sourdough loaf",
            link: { type: "subscription", id: "sub_1" },
        });
    });

    it("a failed renewal is one thing to act on, not also an overdue invoice", async () => {
        const unpaid = {
            ...RENEWAL_CHARGE,
            status: "ISSUED",
            dueAt: new Date("2026-09-12T18:30:00Z"),
        };
        const { service } = build(["PAYMENTS"], {
            subs: [SUBSCRIBER],
            subscriptionInvoices: [unpaid],
            invoices: [
                {
                    ...OVERDUE,
                    id: "inv_r",
                    source: "SUBSCRIPTION",
                    dueAt: unpaid.dueAt,
                    subscriptionId: "sub_1",
                },
            ],
        });
        const res = await service.month(OWNER, "2026-09", NOW);

        expect(res.toActOn).toEqual([
            expect.objectContaining({
                kind: "renewal_failed",
                date: "2026-09-13",
                link: { type: "subscription", id: "sub_1" },
            }),
        ]);
        expect(
            res.days.find((d) => d.date === "2026-09-13")?.layers.subscriptions
                ?.kinds,
        ).toEqual({ failed: 1 });
    });

    it("a class start is one item with its places", async () => {
        const at = new Date("2026-09-08T01:30:00Z");
        const spin = {
            serviceId: "svc_spin",
            startAt: at,
            service: { name: "Spin", capacity: 2 },
            staff: { name: "Meera" },
        };
        const { service } = build(["APPOINTMENTS"], {
            classes: [spin, spin],
        });
        const res = await service.month(OWNER, "2026-09", NOW);
        expect(res.days[7].layers.classes?.items).toEqual([
            expect.objectContaining({
                kind: "full",
                title: "Spin",
                subtitle: "2 of 2 booked · Meera",
                link: { type: "service", id: "svc_spin" },
            }),
        ]);
    });

    it("a module that is off contributes no layer", async () => {
        const { service } = build(["APPOINTMENTS"]);
        const res = await service.month(OWNER, "2026-09", NOW);
        expect(res.layers).toEqual(["bookings", "classes"]);
        // Money, but nothing to take it through: no orders, no invoices.
        expect(res.takings).toEqual({ lead: "bookings", total: [] });
    });

    it("refuses a malformed month and a reviewer", async () => {
        const { service } = build();
        await expect(
            service.month(OWNER, "2026-9", NOW),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.month({ ...OWNER, role: "REVIEWER" }, "2026-09", NOW),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
