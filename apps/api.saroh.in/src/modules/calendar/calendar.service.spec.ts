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
        // No invoice: dated by its placing, like an order from before
        // orders were invoiced.
        invoices: [],
        ...over,
    };
}

/** One of an order's own papers, as the takings read selects it. */
function paper(
    kind: "INVOICE" | "SUPPLEMENTARY" | "CREDIT_NOTE",
    total: string,
    at: Date,
) {
    return {
        kind,
        total,
        currency: "INR",
        paidAt: kind === "CREDIT_NOTE" ? null : at,
        issuedAt: at,
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
    orderId: null,
    contact: null,
};

interface Fixture {
    profileZone?: string | null;
    orders?: object[];
    collectionSubs?: object[];
    subs?: object[];
    subscriptionInvoices?: object[];
    invoices?: object[];
    /** Orders' own paper: invoices, supplementaries and credit notes. */
    orderPaper?: object[];
    bookings?: object[];
    classes?: object[];
    failInvoices?: boolean;
    /** The money read's paper (E19): paid invoices and credit notes. */
    moneyPaper?: object[];
    /** Payment intents with a reported fee (E19). */
    fees?: object[];
    failFees?: boolean;
    /** When the business was created; `"fail"` makes the read throw. */
    createdAt?: Date | "fail";
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

    const invoiceRead = jest.fn(
        (args: {
            where: { source?: string; orderId?: unknown; status?: unknown };
        }) => {
            if (args.where.source === "SUBSCRIPTION") {
                return Promise.resolve(f.subscriptionInvoices ?? []);
            }
            if (args.where.orderId) {
                return Promise.resolve(f.orderPaper ?? []);
            }
            if (args.where.status) {
                return Promise.resolve(f.moneyPaper ?? []);
            }
            if (f.failInvoices) {
                return Promise.reject(
                    new Error("invoices table is mid-migration"),
                );
            }
            return Promise.resolve(f.invoices ?? []);
        },
    );

    const db = {
        organization: {
            findUnique: jest.fn(() =>
                f.createdAt === "fail"
                    ? Promise.reject(new Error("connection reset"))
                    : Promise.resolve({
                          createdAt:
                              f.createdAt ?? new Date("2026-06-02T05:00:00Z"),
                      }),
            ),
        },
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
        paymentIntent: {
            findMany: jest.fn(() =>
                f.failFees
                    ? Promise.reject(new Error("fees unreadable"))
                    : Promise.resolve(f.fees ?? []),
            ),
        },
        booking: {
            findMany: jest.fn(
                (args: { where: { service: { capacity: { gt?: number } } } }) =>
                    Promise.resolve(
                        args.where.service.capacity.gt === undefined
                            ? (f.bookings ?? []).map((b) => ({
                                  snapshot: {},
                                  invoices: [],
                                  ...b,
                              }))
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
                    paidWith: "PACK",
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
            title: "Physio · Asha Rao",
            subtitle: "With Ravi · Class pack",
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
        // Its Due is missing, so no money is sent — and Invoices, named
        // already, says why.
        expect(res.money).toEqual({ total: null, entries: [] });
        expect(res.days[4]).not.toHaveProperty("money");
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

    it("an order's own invoice is its order: not on the Invoices layer, not counted twice", async () => {
        const paidAt = new Date("2026-09-05T05:00:00Z");
        const ordersOwn = {
            ...OVERDUE,
            id: "inv_order",
            number: "RC/26-27/0101",
            status: "PAID",
            source: "ORDER",
            total: "250",
            paidAt,
            orderId: "o1",
        };
        const renewalPaid = {
            ...OVERDUE,
            id: "inv_renewal",
            status: "PAID",
            source: "SUBSCRIPTION",
            total: "1200",
            paidAt,
            subscriptionId: "sub_1",
        };
        const handWritten = {
            ...OVERDUE,
            id: "inv_hand",
            status: "PAID",
            paidAt,
        };
        const { service } = build(undefined, {
            orders: [
                order("o1", "2026-09-05T04:00:00Z", {
                    invoices: [{ id: "inv_order" }],
                }),
            ],
            invoices: [ordersOwn, renewalPaid, handWritten],
            orderPaper: [paper("INVOICE", "250", paidAt)],
        });
        const res = await service.month(OWNER, "2026-09", NOW);

        const fifth = res.days.find((d) => d.date === "2026-09-05")!;
        // The renewal's charge is the Subscriptions layer's to show.
        expect(fifth.layers.invoices?.items.map((i) => i.id)).toEqual([
            "inv_hand",
        ]);
        // The order (250) once, the renewal (1200) and the hand-written
        // invoice (4000): the order's own invoice adds nothing.
        expect(fifth.takings).toEqual([{ currency: "INR", amount: "5450.00" }]);
    });

    it("an order's money is dated by its paper: paid invoices in, credit notes out", async () => {
        const { service, db } = build(["COMMERCE", "PAYMENTS"], {
            // Placed on 30 Sep, so not among October's orders; its invoice
            // was paid on 2 Oct.
            orders: [],
            orderPaper: [
                paper("INVOICE", "1000", new Date("2026-10-02T06:00:00Z")),
                // Cash at the counter, recorded by hand on the 3rd.
                paper("INVOICE", "400", new Date("2026-10-03T08:00:00Z")),
                // ₹1,000 paid and ₹300 of it refunded on the 6th.
                paper("INVOICE", "1000", new Date("2026-10-06T05:00:00Z")),
                paper("CREDIT_NOTE", "300", new Date("2026-10-06T09:00:00Z")),
                // An edit's difference, paid on the 7th.
                paper("SUPPLEMENTARY", "150", new Date("2026-10-07T05:00:00Z")),
            ],
        });
        const res = await service.month(OWNER, "2026-10", NOW);
        const day = (d: string) => res.days.find((x) => x.date === d)!;

        expect(day("2026-10-02").takings).toEqual([
            { currency: "INR", amount: "1000.00" },
        ]);
        expect(day("2026-10-03").takings).toEqual([
            { currency: "INR", amount: "400.00" },
        ]);
        expect(day("2026-10-06").takings).toEqual([
            { currency: "INR", amount: "700.00" },
        ]);
        expect(day("2026-10-07").takings).toEqual([
            { currency: "INR", amount: "150.00" },
        ]);
        expect(res.takings?.total).toEqual([
            { currency: "INR", amount: "2250.00" },
        ]);
        // Paid and issued inside the business's month; never a draft or a
        // voided paper.
        expect(db.invoice.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    orderId: { not: null },
                    status: { notIn: ["DRAFT", "VOID"] },
                    OR: [
                        {
                            kind: { in: ["INVOICE", "SUPPLEMENTARY"] },
                            paidAt: {
                                gte: new Date("2026-09-30T18:30:00Z"),
                                lt: new Date("2026-10-31T18:30:00Z"),
                            },
                        },
                        {
                            kind: "CREDIT_NOTE",
                            issuedAt: {
                                gte: new Date("2026-09-30T18:30:00Z"),
                                lt: new Date("2026-10-31T18:30:00Z"),
                            },
                        },
                    ],
                },
            }),
        );
    });

    it("an order placed and invoiced is not also counted on its placing", async () => {
        const { service } = build(["COMMERCE", "PAYMENTS"], {
            // Paid (its invoice exists), but the payment fell in October.
            orders: [
                order("o1", "2026-09-30T10:00:00Z", {
                    invoices: [{ id: "inv_o1" }],
                }),
            ],
            orderPaper: [],
        });
        const res = await service.month(OWNER, "2026-09", NOW);
        expect(res.days[29].layers.orders?.count).toBe(1);
        expect(res.days[29].takings).toEqual([]);
        expect(res.takings?.total).toEqual([]);
    });

    it("a viewer without money reads no order paper", async () => {
        const { service, db } = build(["COMMERCE"], {
            orders: [order("o1", "2026-09-05T04:00:00Z")],
        });
        await service.month(
            {
                ...OWNER,
                role: "ADMIN",
                actions: new Set(["org:read", "order:read"] as const),
            },
            "2026-09",
            NOW,
        );
        expect(db.invoice.findMany).not.toHaveBeenCalled();
    });

    it("a live hold is held, not booked, and not said to be paid", async () => {
        const { service, db } = build(["APPOINTMENTS"], {
            bookings: [
                {
                    id: "bk_hold",
                    startAt: new Date("2026-09-22T04:30:00Z"),
                    status: "PENDING",
                    outcome: null,
                    paidWith: "PAID",
                    bookerName: "Asha",
                    bookerEmail: null,
                    service: { name: "Physio" },
                    staff: { name: "Ravi" },
                    contact: null,
                },
            ],
        });
        const res = await service.month(OWNER, "2026-09", NOW);

        expect(res.days[21].layers.bookings?.items[0]).toMatchObject({
            kind: "held",
            subtitle: "With Ravi",
        });
        // Only what takes a place is read: confirmed, or a hold inside its
        // time — the rule the booking page's capacity counts use.
        for (const call of db.booking.findMany.mock.calls) {
            expect(call[0].where).toMatchObject({
                OR: [
                    { status: "CONFIRMED" },
                    { status: "PENDING", holdExpiresAt: { gt: NOW } },
                ],
            });
        }
    });

    it("a live hold takes a class seat and is named as held", async () => {
        const at = new Date("2026-09-08T01:30:00Z");
        const spin = {
            serviceId: "svc_spin",
            startAt: at,
            status: "CONFIRMED",
            service: { name: "Spin", capacity: 2 },
            staff: { name: "Meera" },
        };
        const { service } = build(["APPOINTMENTS"], {
            classes: [spin, { ...spin, status: "PENDING" }],
        });
        const res = await service.month(OWNER, "2026-09", NOW);
        expect(res.days[7].layers.classes?.items).toEqual([
            expect.objectContaining({
                kind: "full",
                subtitle: "1 of 2 booked · 1 held · Meera",
            }),
        ]);
    });

    it("a renewal's charge stays on the Invoices layer for someone who cannot see subscriptions", async () => {
        const renewalDue = {
            ...OVERDUE,
            id: "inv_renewal",
            source: "SUBSCRIPTION",
            dueAt: new Date("2026-09-25T06:00:00Z"),
            subscriptionId: "sub_1",
        };
        const { service } = build(["PAYMENTS"], { invoices: [renewalDue] });
        const res = await service.month(
            {
                ...OWNER,
                role: "ADMIN",
                actions: new Set(["org:read", "invoice:read"] as const),
            },
            "2026-09",
            NOW,
        );
        expect(res.layers).toEqual(["invoices"]);
        expect(
            res.days.find((d) => d.date === "2026-09-25")?.layers.invoices
                ?.kinds,
        ).toEqual({ due: 1 });
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
    it("names the day the business joined, in its own zone", async () => {
        // 20:00 UTC on 31 May is already 1 June in India.
        const { service } = build(undefined, {
            createdAt: new Date("2026-05-31T20:00:00Z"),
        });
        const res = await service.month(OWNER, "2026-09", NOW);
        expect(res.joinedAt).toBe("2026-06-01");
    });

    it("leaves the joined day out, not the month, when it cannot be read", async () => {
        const { service } = build(undefined, {
            createdAt: "fail",
            orders: [order("o1", "2026-09-05T04:00:00Z")],
        });
        const res = await service.month(OWNER, "2026-09", NOW);
        expect(res.joinedAt).toBeNull();
        expect(res.totals.orders).toBe(1);
        expect(res.unavailable).toEqual([]);
    });
});

/** A paid or credited piece of paper, as the money read selects it (E19). */
function moneyPaper(over: {
    id: string;
    kind?: "INVOICE" | "SUPPLEMENTARY" | "CREDIT_NOTE";
    total: string;
    at: string;
    orderId?: string | null;
    source?: string;
    bookingId?: string | null;
    subscriptionId?: string | null;
    relatedInvoiceId?: string | null;
}) {
    const kind = over.kind ?? "INVOICE";
    return {
        id: over.id,
        number: `INV-${over.id}`,
        kind,
        source: over.source ?? (over.orderId ? "ORDER" : "MANUAL"),
        total: over.total,
        currency: "INR",
        paidAt: kind === "CREDIT_NOTE" ? null : new Date(over.at),
        issuedAt: new Date(over.at),
        orderId: over.orderId ?? null,
        bookingId: over.bookingId ?? null,
        subscriptionId: over.subscriptionId ?? null,
        relatedInvoiceId: over.relatedInvoiceId ?? null,
        order: over.orderId ? { orderId: over.orderId.toUpperCase() } : null,
        billToName: null,
        contact: customer,
    };
}

/** A payment intent with the fee its provider reported (E19). */
function fee(over: {
    feeCents: number;
    capturedAt: string | null;
    orderId?: string;
    invoice?: object;
}) {
    return {
        feeCents: over.feeCents,
        currency: "INR",
        updatedAt: new Date("2026-09-25T06:00:00Z"),
        orderId: over.orderId ?? null,
        order: over.orderId ? { orderId: over.orderId.toUpperCase() } : null,
        invoice: over.invoice ?? null,
        attempts: over.capturedAt
            ? [{ createdAt: new Date(over.capturedAt) }]
            : [],
    };
}

type Month = Awaited<ReturnType<CalendarService["month"]>>;
const dayOfMonth = (res: Month, d: string) =>
    res.days.find((x) => x.date === d)!;

/** An order paid on the 5th for 500, its invoice paid then. */
const PAID_ON_5TH = moneyPaper({
    id: "i1",
    total: "500.00",
    at: "2026-09-05T04:05:00Z",
    orderId: "o1",
});
const REFUND_ON_5TH = moneyPaper({
    id: "cn1",
    kind: "CREDIT_NOTE",
    total: "100.00",
    at: "2026-09-05T09:00:00Z",
    orderId: "o1",
});

describe("CalendarService.month — money in, out and due (E19)", () => {
    it("a paid order, its refund and a reported fee: in, and out = refund + fee", async () => {
        const { service } = build(["COMMERCE"], {
            orders: [order("o1", "2026-09-05T04:00:00Z", { invoices: [{}] })],
            moneyPaper: [PAID_ON_5TH, REFUND_ON_5TH],
            fees: [
                fee({
                    feeCents: 1180,
                    capturedAt: "2026-09-05T04:05:00Z",
                    orderId: "o1",
                }),
            ],
        });
        const res = await service.month(OWNER, "2026-09", NOW);
        const fifth = dayOfMonth(res, "2026-09-05");

        expect(fifth.money).toEqual([
            {
                currency: "INR",
                in: 50000,
                out: 11180,
                net: 38820,
                due: 0,
                failed: 0,
            },
        ]);
        expect(fifth.layers.orders?.items[0]).toMatchObject({
            id: "o1",
            in: 50000,
            out: 11180,
            outWhy: ["refund", "fee"],
        });
        expect(res.money?.total).toEqual(fifth.money);
        expect(res.money?.entries.map((e) => [e.kind, e.itemId])).toEqual([
            ["fee", "o1"],
            ["order_paid", "o1"],
            ["refund", "o1"],
        ]);
        // A quiet day has money, at nothing.
        expect(dayOfMonth(res, "2026-09-06").money).toEqual([]);
    });

    it("no fee reported: none is guessed, and out is the refund alone", async () => {
        const { service } = build(["COMMERCE"], {
            orders: [order("o1", "2026-09-05T04:00:00Z", { invoices: [{}] })],
            moneyPaper: [PAID_ON_5TH, REFUND_ON_5TH],
        });
        const res = await service.month(OWNER, "2026-09", NOW);
        const fifth = dayOfMonth(res, "2026-09-05");
        expect(fifth.money?.[0]).toMatchObject({ in: 50000, out: 10000 });
        expect(fifth.layers.orders?.items[0].outWhy).toEqual(["refund"]);
    });

    it("an order and its own invoice count once", async () => {
        const own = {
            ...OVERDUE,
            id: "i1",
            status: "PAID",
            orderId: "o1",
            paidAt: new Date("2026-09-05T04:05:00Z"),
        };
        const { service } = build(undefined, {
            orders: [order("o1", "2026-09-05T04:00:00Z", { invoices: [{}] })],
            invoices: [own],
            moneyPaper: [PAID_ON_5TH],
        });
        const res = await service.month(OWNER, "2026-09", NOW);
        expect(res.money?.total).toEqual([
            expect.objectContaining({ in: 50000 }),
        ]);
        expect(dayOfMonth(res, "2026-09-05").layers.invoices?.count).toBe(0);
    });

    it("an order paid days after it was placed: the payment day's money, with no item to sit on", async () => {
        const { service } = build(["COMMERCE"], {
            orders: [order("o1", "2026-09-05T04:00:00Z", { invoices: [{}] })],
            moneyPaper: [
                { ...PAID_ON_5TH, paidAt: new Date("2026-09-07T04:00:00Z") },
            ],
        });
        const res = await service.month(OWNER, "2026-09", NOW);
        expect(dayOfMonth(res, "2026-09-05").money).toEqual([]);
        expect(
            dayOfMonth(res, "2026-09-05").layers.orders?.items[0],
        ).not.toHaveProperty("in");
        expect(dayOfMonth(res, "2026-09-07").money?.[0].in).toBe(50000);
        expect(res.money?.entries).toEqual([
            expect.objectContaining({
                date: "2026-09-07",
                kind: "order_paid",
                link: { type: "order", id: "o1" },
                itemId: null,
            }),
        ]);
    });

    it("a paid invoice sits on its invoice; a fee on its pay link counts out", async () => {
        const paid = {
            ...OVERDUE,
            id: "inv_p",
            status: "PAID",
            paidAt: new Date("2026-09-09T06:00:00Z"),
        };
        const paper = moneyPaper({
            id: "inv_p",
            total: "4000.00",
            at: "2026-09-09T06:00:00Z",
        });
        const { service } = build(["PAYMENTS"], {
            invoices: [paid],
            moneyPaper: [paper],
            fees: [
                fee({
                    feeCents: 9440,
                    capturedAt: "2026-09-09T06:00:00Z",
                    invoice: paper,
                }),
            ],
        });
        const res = await service.month(OWNER, "2026-09", NOW);
        expect(
            dayOfMonth(res, "2026-09-09").layers.invoices?.items[0],
        ).toMatchObject({ in: 400000, out: 9440, outWhy: ["fee"] });
        expect(dayOfMonth(res, "2026-09-09").money?.[0]).toMatchObject({
            in: 400000,
            out: 9440,
            net: 390560,
        });
    });

    it("due, and failed renewals totalled apart", async () => {
        const failedCharge = {
            ...RENEWAL_CHARGE,
            id: "inv_f",
            // Due on the 13th (IST), unpaid on the 20th: failed.
            status: "ISSUED",
            total: "1800",
        };
        const { service } = build(undefined, {
            subs: [SUBSCRIBER],
            subscriptionInvoices: [failedCharge],
            invoices: [
                {
                    ...OVERDUE,
                    id: "inv_d",
                    dueAt: new Date("2026-09-28T06:00:00Z"),
                },
            ],
            bookings: [
                {
                    id: "bk_1",
                    startAt: new Date("2026-09-24T04:30:00Z"),
                    status: "CONFIRMED",
                    outcome: null,
                    paidWith: "DESK",
                    bookerName: null,
                    bookerEmail: null,
                    service: { name: "Physio" },
                    staff: null,
                    contact: customer,
                    snapshot: {
                        service: { priceCents: 150000, currency: "INR" },
                        deposit: { cents: 50000 },
                    },
                    invoices: [
                        {
                            status: "PAID",
                            paymentIntents: [{ amountCents: 50000 }],
                        },
                    ],
                },
            ],
        });
        const res = await service.month(OWNER, "2026-09", NOW);

        // The charge failed on its due day; its renewal is not also due.
        expect(dayOfMonth(res, "2026-09-13").money).toEqual([
            expect.objectContaining({ due: 0, failed: 180000 }),
        ]);
        expect(dayOfMonth(res, "2026-09-06").money).toEqual([]);
        // The rest of the booking's price, less its deposit.
        expect(dayOfMonth(res, "2026-09-24").money?.[0].due).toBe(100000);
        expect(
            dayOfMonth(res, "2026-09-24").layers.bookings?.items[0],
        ).toMatchObject({ amount: "1500.00", currency: "INR", due: 100000 });
        expect(dayOfMonth(res, "2026-09-28").money?.[0].due).toBe(400000);
        expect(res.money?.total).toEqual([
            {
                currency: "INR",
                in: 0,
                out: 0,
                net: 0,
                due: 500000,
                failed: 180000,
            },
        ]);
    });

    it("a renewal still to come is due", async () => {
        const { service } = build(["PAYMENTS"], {
            subs: [
                {
                    ...SUBSCRIBER,
                    currentPeriodEnd: new Date("2026-09-25T18:30:00Z"),
                },
            ],
        });
        const res = await service.month(OWNER, "2026-09", NOW);
        expect(dayOfMonth(res, "2026-09-26").money).toEqual([
            expect.objectContaining({ due: 120000 }),
        ]);
    });

    it("a booking already past, one with a pay link open, and a live hold have no Due", async () => {
        const base = {
            status: "CONFIRMED",
            outcome: null,
            paidWith: "DESK",
            bookerName: null,
            bookerEmail: null,
            service: { name: "Physio" },
            staff: null,
            contact: customer,
            snapshot: { service: { priceCents: 150000, currency: "INR" } },
        };
        const { service } = build(["APPOINTMENTS"], {
            bookings: [
                {
                    ...base,
                    id: "past",
                    startAt: new Date("2026-09-08T04:30:00Z"),
                },
                {
                    ...base,
                    id: "linked",
                    startAt: new Date("2026-09-24T04:30:00Z"),
                    invoices: [{ status: "ISSUED", paymentIntents: [] }],
                },
                {
                    ...base,
                    id: "held",
                    status: "PENDING",
                    startAt: new Date("2026-09-25T04:30:00Z"),
                },
            ],
        });
        const res = await service.month(OWNER, "2026-09", NOW);
        expect(res.money?.total).toEqual([]);
    });

    it("a caller without payment:read: bookings with their prices, and no money cells", async () => {
        const { service, db } = build(undefined, {
            bookings: [
                {
                    id: "bk_1",
                    startAt: new Date("2026-09-24T04:30:00Z"),
                    status: "CONFIRMED",
                    outcome: null,
                    paidWith: "DESK",
                    bookerName: null,
                    bookerEmail: null,
                    service: { name: "Physio" },
                    staff: null,
                    contact: customer,
                    snapshot: {
                        service: { priceCents: 150000, currency: "INR" },
                    },
                },
            ],
        });
        const res = await service.month(MEMBER, "2026-09", NOW);
        const item = dayOfMonth(res, "2026-09-24").layers.bookings?.items[0];
        expect(item).toMatchObject({ amount: "1500.00", currency: "INR" });
        for (const key of ["in", "out", "due", "failed", "outWhy"]) {
            expect(item).not.toHaveProperty(key);
        }
        expect(res).not.toHaveProperty("money");
        for (const d of res.days) expect(d).not.toHaveProperty("money");
        expect(db.paymentIntent.findMany).not.toHaveBeenCalled();
    });

    it("payment:read alone gets the money, read from the paper whatever layers it sees", async () => {
        const { service } = build(undefined, {
            moneyPaper: [
                moneyPaper({
                    id: "inv_p",
                    total: "2000.00",
                    at: "2026-09-09T06:00:00Z",
                }),
            ],
        });
        const res = await service.month(
            {
                ...OWNER,
                role: "CUSTOM",
                actions: new Set(["org:read", "payment:read"]),
            },
            "2026-09",
            NOW,
        );
        expect(res.layers).toEqual([]);
        expect(res).not.toHaveProperty("takings");
        expect(res.money?.entries).toEqual([
            expect.objectContaining({
                kind: "invoice_paid",
                in: 200000,
                link: { type: "invoice", id: "inv_p" },
                itemId: null,
            }),
        ]);
    });

    it("the fees unreadable: no money, and Money named", async () => {
        const { service } = build(["COMMERCE"], {
            orders: [order("o1", "2026-09-05T04:00:00Z")],
            failFees: true,
        });
        const res = await service.month(OWNER, "2026-09", NOW);
        expect(res.money).toEqual({ total: null, entries: [] });
        expect(res.unavailable).toEqual([{ source: "money", label: "Money" }]);
        expect(res.days[4]).not.toHaveProperty("money");
        // The takings do not rest on the fees.
        expect(res.takings?.total).toEqual([
            { currency: "INR", amount: "250.00" },
        ]);
    });
});
