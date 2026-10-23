// Whether the plan lets the business connect its own email (DEC-091),
// switched per test; the real check is in billing/online-payments-plan.
jest.mock("../billing/online-payments-plan", () => ({
    planConnectsOwnAccounts: jest.fn(() => Promise.resolve(true)),
}));

import { quietLastDay } from "../../../test/home-quiet-db";
import { planConnectsOwnAccounts } from "../billing/online-payments-plan";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { soonCutoff } from "./home-open-orders";
import { HomeService } from "./home.service";

type View = {
    key: string;
    label: string;
    readiness: string;
    blockers?: { code: string; message?: string; actionHref?: string }[];
};

interface Fixture {
    /** Overdue follow-up rows; `activity` count defaults to their length. */
    activities?: {
        id: string;
        dueAt: Date | null;
        lead: {
            id: string;
            title: string;
            value: number | null;
            contact: {
                firstName: string | null;
                lastName: string | null;
                email: string;
            } | null;
        };
    }[];
    activityCount?: number;
    orders?: {
        id: string;
        orderId: string;
        storeId: string;
        total: string;
        currency: string;
        createdAt: Date;
        customer: {
            firstName: string | null;
            lastName: string | null;
            email: string;
        };
    }[];
    orderCount?: number;
    /** R34's not-collected orders (`payOnHandover` reads); none by default. */
    uncollected?: unknown[];
    bookings?: {
        id: string;
        startAt: Date;
        endAt: Date;
        timezone: string;
        status: string;
        bookerName: string | null;
        bookerEmail: string | null;
        service: { name: string };
        contact: {
            firstName: string | null;
            lastName: string | null;
            email: string;
        } | null;
    }[];
    bookingCount?: number;
    leadCount?: number;
    contactCount?: number;
}

function build(views: View[], fixture: Fixture = {}) {
    const availability = {
        listViews: jest
            .fn()
            .mockResolvedValue(views.map((v) => ({ blockers: [], ...v }))),
    } as unknown as ModuleAvailabilityService;

    const activities = fixture.activities ?? [];
    const orders = fixture.orders ?? [];
    const bookings = fixture.bookings ?? [];

    const db = {
        activity: {
            count: jest
                .fn()
                .mockResolvedValue(fixture.activityCount ?? activities.length),
            findMany: jest.fn().mockResolvedValue(activities),
        },
        // R34's uncollected orders (`payOnHandover` in the where): none,
        // so every other order read answers as it did.
        order: {
            count: jest.fn((args?: { where?: { payOnHandover?: boolean } }) =>
                Promise.resolve(
                    args?.where?.payOnHandover === true
                        ? (fixture.uncollected?.length ?? 0)
                        : (fixture.orderCount ?? orders.length),
                ),
            ),
            findMany: jest.fn(
                (args?: { where?: { payOnHandover?: boolean } }) =>
                    Promise.resolve(
                        args?.where?.payOnHandover === true
                            ? (fixture.uncollected ?? [])
                            : orders,
                    ),
            ),
        },
        booking: {
            count: jest
                .fn()
                .mockResolvedValue(fixture.bookingCount ?? bookings.length),
            findMany: jest.fn().mockResolvedValue(bookings),
        },
        lead: { count: jest.fn().mockResolvedValue(fixture.leadCount ?? 0) },
        contact: {
            count: jest.fn().mockResolvedValue(fixture.contactCount ?? 0),
        },
        // Round 2 F1's sources, empty: nothing overdue, owed, short or
        // unpublished, so every existing expectation reads as it did.
        invoice: {
            count: jest.fn().mockResolvedValue(0),
            findMany: jest.fn().mockResolvedValue([]),
        },
        paymentIntent: {
            count: jest.fn().mockResolvedValue(0),
            findMany: jest.fn().mockResolvedValue([]),
        },
        // B9's failed refunds: none.
        paymentRefund: { findMany: jest.fn().mockResolvedValue([]) },
        site: {
            count: jest.fn().mockResolvedValue(0),
            findMany: jest.fn().mockResolvedValue([]),
        },
        storeSettings: {
            aggregate: jest
                .fn()
                .mockResolvedValue({ _max: { pickupLateAfterMinutes: null } }),
        },
        businessProfile: { findUnique: jest.fn().mockResolvedValue(null) },
        // D8's paused-subscriptions source: Payments on, so it has nothing.
        organizationModule: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const stockChecks = { openShort: jest.fn().mockResolvedValue([]) };
    return new HomeService(
        availability,
        quietLastDay(db) as never,
        stockChecks as never,
    );
}

const INPUT = { organizationId: "org_1", organizationRole: "OWNER" as const };

const OVERDUE_TASK = {
    id: "act_1",
    dueAt: new Date("2026-07-01T09:00:00.000Z"),
    lead: {
        id: "lead_1",
        title: "Bulk order enquiry",
        value: 4500000,
        contact: {
            firstName: "Ananya",
            lastName: "Rao",
            email: "ananya@example.com",
        },
    },
};

const OPEN_ORDER = {
    id: "ord_1",
    orderId: "ORD-004",
    storeId: "store_1",
    total: "1250.50",
    currency: "INR",
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
    // Its storefront never saved settings: the default thresholds.
    store: { settings: null },
    customer: {
        firstName: "Vikram",
        lastName: "Shetty",
        email: "vikram@example.com",
    },
};

/**
 * Home aggregates several independent reads. Before #177 they were awaited
 * unguarded, so one failing source threw out of `build()` and the merchant got
 * the segment error boundary: no actions, no schedule, no numbers — including
 * every part that had answered fine. Home is where the decision about what to
 * do next is made, and "everything is broken" was both untrue and the least
 * useful thing to say.
 */
describe("HomeService degrades one source at a time (#177, §30)", () => {
    const ACTIVE_ALL: View[] = [
        { key: "COMMERCE", label: "Sell", readiness: "ACTIVE" },
        { key: "APPOINTMENTS", label: "Appointments", readiness: "ACTIVE" },
    ];

    function buildWithFailure(
        failing: "order" | "booking",
        views: View[] = ACTIVE_ALL,
    ) {
        const service = build(views, {
            bookings: [
                {
                    id: "bk_1",
                    startAt: new Date("2026-08-01T09:00:00.000Z"),
                    endAt: new Date("2026-08-01T10:00:00.000Z"),
                    timezone: "Asia/Kolkata",
                    status: "CONFIRMED",
                    bookerName: "Priya",
                    bookerEmail: null,
                    service: { name: "Consultation" },
                    contact: null,
                },
            ],
            orders: [OPEN_ORDER],
        });

        // Reach the mocked client the service was constructed with.
        const db = (
            service as unknown as {
                db: Record<
                    string,
                    {
                        count: jest.Mock;
                        findMany: jest.Mock;
                    }
                >;
            }
        ).db;
        const boom = new Error("relation is being migrated");
        db[failing].count.mockRejectedValue(boom);
        db[failing].findMany.mockRejectedValue(boom);
        return service;
    }

    it("still returns the parts that answered when open orders fail", async () => {
        const home = await buildWithFailure("order").build(INPUT);

        // Today reads orders for its pick-ups, so it is named too (F5),
        // and so does This week for its order count (F7), and the orders
        // nobody came for (R34).
        expect(home.unavailable).toEqual([
            { moduleKey: "COMMERCE", label: "Open orders" },
            { moduleKey: "APPOINTMENTS", label: "Today" },
            { moduleKey: "HOME", label: "This week" },
            { moduleKey: "COMMERCE", label: "Uncollected orders" },
            // Home A's How it's going counts the last 7 days' orders.
            { moduleKey: "HOME", label: "How it's going" },
        ]);
        // The schedule survived, which is the whole point.
        expect(home.upcoming).toHaveLength(1);
    });

    it("names the schedule when it is the part that failed", async () => {
        const home = await buildWithFailure("booking").build(INPUT);

        // This week counts the week's bookings too (F7).
        expect(home.unavailable).toEqual([
            { moduleKey: "APPOINTMENTS", label: "Schedule" },
            { moduleKey: "APPOINTMENTS", label: "Today" },
            { moduleKey: "HOME", label: "This week" },
            // Home A's bookings awaiting payment, and How it's going's
            // bookings (DEC-171).
            { moduleKey: "APPOINTMENTS", label: "Bookings awaiting payment" },
            { moduleKey: "HOME", label: "How it's going" },
        ]);
        expect(home.upcoming).toEqual([]);
        // Today failed with it: never shown as an empty day.
        expect(home.today).toBeNull();
    });

    // The distinction §30 exists for: a failed source must never be reported
    // as an absence. "No open orders" and "we could not find out" are
    // different facts and the merchant acts on the difference.
    it("does not emit a SUGGESTION that assumes an empty catalog when the read failed", async () => {
        const home = await buildWithFailure("order").build(INPUT);

        expect(home.actions.map((action) => action.code)).not.toContain(
            "COMMERCE_OPEN_ORDERS",
        );
        expect(home.unavailable).not.toHaveLength(0);
    });

    it("reports nothing unavailable on a healthy read", async () => {
        const home = await build(ACTIVE_ALL, { orders: [OPEN_ORDER] }).build(
            INPUT,
        );

        expect(home.unavailable).toEqual([]);
    });

    it("reads the sources at once, not one after another (H-4)", async () => {
        const service = build(ACTIVE_ALL, { orders: [OPEN_ORDER] });
        const db = (
            service as unknown as {
                db: Record<string, { count: jest.Mock }>;
            }
        ).db;
        // Open orders answer only once the schedule — a later source — has
        // been asked for. Read in turn, open orders would wait on a read
        // that is never made; read at once, both are in flight together.
        let scheduleAsked!: () => void;
        const asked = new Promise<void>((resolve) => (scheduleAsked = resolve));
        db.booking.count.mockImplementation(() => {
            scheduleAsked();
            return Promise.resolve(1);
        });
        db.order.count.mockImplementation(async () => {
            await asked;
            return 1;
        });
        const home = await Promise.race([
            service.build(INPUT),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("read in turn")), 1000),
            ),
        ]);
        expect(home.unavailable).toEqual([]);
    });
});

describe("HomeService ranking", () => {
    it("puts an attention action before a suggestion", async () => {
        const svc = build([
            {
                key: "PAYMENTS",
                label: "Payments",
                readiness: "ATTENTION_REQUIRED",
                blockers: [{ code: "X", message: "Provider failing" }],
            },
            { key: "COMMERCE", label: "Commerce", readiness: "ACTIVE" },
        ]);
        const model = await svc.build(INPUT);
        expect(model.actions[0]?.severity).toBe("ATTENTION");
        expect(model.actions[0]?.moduleKey).toBe("PAYMENTS");
    });

    it("puts an overdue follow-up before a generic analytics nudge", async () => {
        const svc = build(
            [
                { key: "CRM", label: "CRM", readiness: "ACTIVE" },
                { key: "INSIGHTS", label: "Insights", readiness: "ACTIVE" },
            ],
            { activities: [OVERDUE_TASK], activityCount: 3 },
        );
        const model = await svc.build(INPUT);
        expect(model.actions[0]?.code).toBe("CRM_OVERDUE_FOLLOWUPS");
        const codes = model.actions.map((a) => a.code);
        expect(codes.indexOf("CRM_OVERDUE_FOLLOWUPS")).toBeLessThan(
            codes.indexOf("INSIGHTS_VIEW"),
        );
    });

    it("puts an unfulfilled order before a module still awaiting setup", async () => {
        // The pair that was ranked backwards: a paying customer waiting on an
        // order outranks configuration a merchant can do whenever.
        const svc = build(
            [
                { key: "COMMERCE", label: "Commerce", readiness: "ACTIVE" },
                {
                    key: "COMMUNICATIONS",
                    label: "Communications",
                    readiness: "SETUP_REQUIRED",
                    blockers: [
                        { code: "NO_PROVIDER", message: "Connect a provider." },
                    ],
                },
            ],
            { orders: [OPEN_ORDER] },
        );
        const model = await svc.build(INPUT);
        expect(model.actions[0]?.code).toBe("COMMERCE_OPEN_ORDERS");
        const codes = model.actions.map((a) => a.code);
        expect(
            model.actions.findIndex((a) => a.severity === "OVERDUE"),
        ).toBeLessThan(codes.length);
        expect(
            model.actions.findIndex((a) => a.severity === "OVERDUE"),
        ).toBeLessThan(model.actions.findIndex((a) => a.severity === "SETUP"));
    });

    it("emits no appointment actions when Appointments is disabled", async () => {
        const svc = build([
            {
                key: "APPOINTMENTS",
                label: "Appointments",
                readiness: "DISABLED",
            },
            { key: "CRM", label: "CRM", readiness: "ACTIVE" },
        ]);
        const model = await svc.build(INPUT);
        expect(model.actions.some((a) => a.moduleKey === "APPOINTMENTS")).toBe(
            false,
        );
    });

    it("reports no modules for a brand-new Organization", async () => {
        const svc = build([
            { key: "CRM", label: "CRM", readiness: "DISABLED" },
            { key: "COMMERCE", label: "Commerce", readiness: "DISABLED" },
        ]);
        const model = await svc.build(INPUT);
        expect(model.hasAnyModule).toBe(false);
        expect(model.actions).toEqual([]);
    });

    it("surfaces open orders as overdue work when Commerce is active", async () => {
        const svc = build(
            [{ key: "COMMERCE", label: "Commerce", readiness: "ACTIVE" }],
            { orders: [OPEN_ORDER], orderCount: 2 },
        );
        const model = await svc.build(INPUT);
        expect(model.actions[0]?.code).toBe("COMMERCE_OPEN_ORDERS");
        expect(model.actions[0]?.title).toContain("2");
    });
});

describe("HomeService evidence", () => {
    it("names who and how much behind an overdue follow-up", async () => {
        const svc = build([{ key: "CRM", label: "CRM", readiness: "ACTIVE" }], {
            activities: [OVERDUE_TASK],
        });
        const model = await svc.build(INPUT);
        const row = model.actions[0]?.evidence?.[0];

        expect(row?.title).toBe("Bulk order enquiry");
        expect(row?.subtitle).toBe("Ananya Rao");
        expect(row?.at).toBe("2026-07-01T09:00:00.000Z");
        expect(row?.amountMinor).toBe(4500000);
        // A Lead records no currency, so none may be claimed.
        expect(row?.currency).toBeNull();
        expect(row?.href).toBe("/leads/lead_1");
    });

    it("converts an order's major-unit total to minor units and keeps its currency", async () => {
        // The two money sources disagree; a client that assumed one convention
        // would render ₹12.50 as ₹1250 or the reverse.
        const svc = build(
            [{ key: "COMMERCE", label: "Commerce", readiness: "ACTIVE" }],
            { orders: [OPEN_ORDER] },
        );
        const model = await svc.build(INPUT);
        const row = model.actions[0]?.evidence?.[0];

        expect(row?.amountMinor).toBe(125050);
        expect(row?.currency).toBe("INR");
        expect(row?.title).toBe("ORD-004");
        expect(row?.subtitle).toBe("Vikram Shetty");
        expect(row?.href).toBe("/commerce/orders/ord_1?storefront=store_1");
    });

    it("reports the true total even when evidence is capped", async () => {
        // Otherwise "5 rows shown" silently reads as "5 rows exist".
        const svc = build(
            [{ key: "COMMERCE", label: "Commerce", readiness: "ACTIVE" }],
            { orders: [OPEN_ORDER], orderCount: 23 },
        );
        const model = await svc.build(INPUT);
        expect(model.actions[0]?.count).toBe(23);
        expect(model.actions[0]?.evidence).toHaveLength(1);
    });
});

describe("HomeService schedule", () => {
    it("sends none of the old Home's primaryAction and numbers (Z5)", async () => {
        const svc = build([{ key: "CRM", label: "CRM", readiness: "ACTIVE" }], {
            leadCount: 12,
            contactCount: 24,
        });
        const model = await svc.build(INPUT);

        expect(model).not.toHaveProperty("primaryAction");
        expect(model).not.toHaveProperty("numbers");
        // The rail's badges still read `actions`; the Next line `upcoming`.
        expect(model).toHaveProperty("actions");
        expect(model).toHaveProperty("upcoming");
    });

    it("lists no bookings for a module the actor cannot see", async () => {
        // A schedule is as much of a leak as an action: bookings on Home tell
        // a merchant with Appointments off that the data exists.
        const svc = build(
            [
                { key: "CRM", label: "CRM", readiness: "DISABLED" },
                {
                    key: "APPOINTMENTS",
                    label: "Appointments",
                    readiness: "DISABLED",
                },
            ],
            { leadCount: 12, contactCount: 24, bookingCount: 8 },
        );
        const model = await svc.build(INPUT);
        expect(model.upcoming).toEqual([]);
    });

    it("still shows the schedule for a module that is available but not yet ACTIVE", async () => {
        // Appointments with no availability windows configured cannot take a
        // NEW booking, but the bookings already on the books are real
        // appointments someone must turn up for. Gating the schedule on ACTIVE
        // hid them from Home while the sidebar still linked to them.
        const svc = build(
            [
                {
                    key: "APPOINTMENTS",
                    label: "Appointments",
                    readiness: "SETUP_REQUIRED",
                    blockers: [{ code: "NO_AVAILABILITY", message: "Set it." }],
                },
            ],
            {
                bookings: [
                    {
                        id: "bk_3",
                        startAt: new Date("2026-08-05T04:30:00.000Z"),
                        endAt: new Date("2026-08-05T05:00:00.000Z"),
                        timezone: "Asia/Kolkata",
                        status: "CONFIRMED",
                        bookerName: "Walk-in",
                        bookerEmail: null,
                        service: { name: "Consultation" },
                        contact: null,
                    },
                ],
            },
        );
        const model = await svc.build(INPUT);

        expect(model.upcoming).toHaveLength(1);
    });

    it.each([
        [true, true],
        [false, false],
    ])(
        "Connect a messaging provider shows only where the plan lets the business connect one (room %s, UX-006)",
        async (room, shown) => {
            (planConnectsOwnAccounts as jest.Mock).mockResolvedValueOnce(room);
            const svc = build([
                {
                    key: "COMMUNICATIONS",
                    label: "Communications",
                    readiness: "SETUP_REQUIRED",
                    blockers: [
                        {
                            code: "COMMUNICATIONS_NO_PROVIDER",
                            message: "Connect a provider to send messages.",
                        },
                    ],
                },
            ]);
            const model = await svc.build(INPUT);
            expect(
                model.actions.some((a) => a.code === "COMMUNICATIONS_SETUP"),
            ).toBe(shown);
        },
    );

    it("does not push order work through a module that is not ready", async () => {
        // The action sends someone at a door. A door that does not open must
        // not be pointed at.
        const svc = build(
            [
                {
                    key: "COMMERCE",
                    label: "Commerce",
                    readiness: "SETUP_REQUIRED",
                    blockers: [{ code: "NO_STORE", message: "Add a store." }],
                },
            ],
            { orders: [OPEN_ORDER], orderCount: 3 },
        );
        const model = await svc.build(INPUT);

        expect(
            model.actions.some((a) => a.code === "COMMERCE_OPEN_ORDERS"),
        ).toBe(false);
    });

    it("carries each booking's own timezone rather than folding to one", async () => {
        const svc = build(
            [
                {
                    key: "APPOINTMENTS",
                    label: "Appointments",
                    readiness: "ACTIVE",
                },
            ],
            {
                bookings: [
                    {
                        id: "bk_1",
                        startAt: new Date("2026-08-05T04:30:00.000Z"),
                        endAt: new Date("2026-08-05T05:00:00.000Z"),
                        timezone: "Asia/Kolkata",
                        status: "CONFIRMED",
                        bookerName: "Walk-in",
                        bookerEmail: null,
                        service: { name: "Consultation" },
                        contact: null,
                    },
                ],
            },
        );
        const model = await svc.build(INPUT);

        expect(model.upcoming).toHaveLength(1);
        expect(model.upcoming[0]).toMatchObject({
            timezone: "Asia/Kolkata",
            serviceName: "Consultation",
            who: "Walk-in",
            startAt: "2026-08-05T04:30:00.000Z",
        });
    });

    it("prefers the linked contact's name over the typed-in booker name", async () => {
        const svc = build(
            [
                {
                    key: "APPOINTMENTS",
                    label: "Appointments",
                    readiness: "ACTIVE",
                },
            ],
            {
                bookings: [
                    {
                        id: "bk_2",
                        startAt: new Date("2026-08-05T04:30:00.000Z"),
                        endAt: new Date("2026-08-05T05:00:00.000Z"),
                        timezone: "Asia/Kolkata",
                        status: "CONFIRMED",
                        bookerName: "a",
                        bookerEmail: null,
                        service: { name: "Consultation" },
                        contact: {
                            firstName: "Kavya",
                            lastName: "Bhat",
                            email: "kavya@example.com",
                        },
                    },
                ],
            },
        );
        const model = await svc.build(INPUT);
        expect(model.upcoming[0]?.who).toBe("Kavya Bhat");
    });
});

/**
 * DEC-163: Needs you lists an open order only when it is late or due today
 * or tomorrow; the rest are in progress, said once as `ordersInProgress`.
 * Which orders are "soon" is the raw read's (`lateSql` at `soonCutoff`,
 * covered against Postgres); here each mocked row says it, and the words
 * on the row are `openOrderWords` reading the real clock below.
 */
describe("Home lists only the orders that need attention soon (DEC-163)", () => {
    // Noon in Mumbai.
    const NOON = new Date("2026-10-16T06:30:00.000Z");
    const HOUR = 3_600_000;
    const COMMERCE: View[] = [
        { key: "COMMERCE", label: "Sell", readiness: "ACTIVE" },
    ];

    beforeEach(() => {
        jest.useFakeTimers({
            now: NOON,
            doNotFake: [
                "setTimeout",
                "clearTimeout",
                "setInterval",
                "clearInterval",
                "setImmediate",
                "clearImmediate",
                "nextTick",
                "queueMicrotask",
                "hrtime",
                "performance",
            ],
        });
    });
    afterEach(() => jest.useRealTimers());

    /** A local delivery (late after 24 hours), placed `ago` before noon. */
    function delivery(
        id: string,
        ago: number,
        flags: { late?: boolean; soon?: boolean } = {},
    ) {
        return {
            ...OPEN_ORDER,
            ...flags,
            id,
            orderId: id.toUpperCase(),
            createdAt: new Date(NOON.getTime() - ago),
            status: "PENDING",
            paymentStatus: "PAID",
            stage: "NEW",
            fulfilment: "LOCAL_DELIVERY",
        };
    }

    const openRows = (needs: { code: string; id: string }[]) =>
        needs.filter((n) => n.code === "COMMERCE_OPEN_ORDERS");

    it("lists a late order", async () => {
        const svc = build(COMMERCE, {
            orders: [delivery("late1", 30 * HOUR, { late: true })],
        });
        const model = await svc.build(INPUT);
        const rows = openRows(model.needs);
        expect(rows).toHaveLength(1);
        expect(model.needs[0]).toMatchObject({
            id: "COMMERCE_OPEN_ORDERS:late1",
            tone: "bad",
        });
        expect(model.needs[0].tag).toMatch(/^Late · /);
        expect(model.ordersInProgress).toBe(0);
    });

    it("lists an order due tomorrow", async () => {
        // Placed 4 hours ago: late at 8 am tomorrow.
        const svc = build(COMMERCE, { orders: [delivery("tmrw", 4 * HOUR)] });
        const model = await svc.build(INPUT);
        expect(openRows(model.needs)).toEqual([
            expect.objectContaining({
                id: "COMMERCE_OPEN_ORDERS:tmrw",
                tag: "Due tomorrow",
            }),
        ]);
        expect(model.needsTotal).toBe(1);
        expect(model.ordersInProgress).toBe(0);
    });

    it("leaves an order due in 3 days off the list, counted as in progress", async () => {
        const svc = build(COMMERCE, {
            orders: [
                delivery("late1", 30 * HOUR, { late: true }),
                delivery("tmrw", 4 * HOUR),
                delivery("later1", HOUR, { soon: false }),
                delivery("later2", HOUR, { soon: false }),
            ],
        });
        const model = await svc.build(INPUT);
        expect(openRows(model.needs).map((n) => n.id)).toEqual([
            "COMMERCE_OPEN_ORDERS:late1",
            "COMMERCE_OPEN_ORDERS:tmrw",
        ]);
        expect(model.needsTotal).toBe(2);
        expect(model.ordersInProgress).toBe(2);
        const action = model.actions.find(
            (a) => a.code === "COMMERCE_OPEN_ORDERS",
        );
        // The rail's Orders badge counts what needs doing soon, too.
        expect(action?.count).toBe(2);
    });

    it("says nothing needs doing when every open order is due later, and suggests no product", async () => {
        const svc = build(COMMERCE, {
            orders: [delivery("later1", HOUR, { soon: false })],
        });
        const model = await svc.build(INPUT);
        expect(openRows(model.needs)).toEqual([]);
        expect(model.ordersInProgress).toBe(1);
        expect(model.actions.map((a) => a.code)).not.toContain(
            "COMMERCE_SUGGEST_PRODUCT",
        );
    });

    it("keeps an order not collected on its own row, whatever its open orders", async () => {
        const svc = build(COMMERCE, {
            orders: [delivery("later1", HOUR, { soon: false })],
            uncollected: [
                {
                    ...delivery("unc1", 5 * 24 * HOUR),
                    fulfilment: "PICKUP",
                    payOnHandover: true,
                    paymentStatus: "UNPAID",
                    customerId: "cus_1",
                    walkInName: null,
                },
            ],
        });
        const model = await svc.build(INPUT);
        expect(model.needs.map((n) => n.code)).toEqual([
            "COMMERCE_UNCOLLECTED_ORDERS",
        ]);
        expect(model.needs[0].title).toMatch(/hasn't collected order/);
        expect(model.ordersInProgress).toBe(1);
    });
});

describe("soonCutoff (DEC-163)", () => {
    it("is the start of the day after tomorrow, in the business's zone", () => {
        // 11:50 pm on the 16th in Mumbai: still the 16th there.
        const now = new Date("2026-10-16T18:20:00.000Z");
        expect(soonCutoff(now, "Asia/Kolkata").toISOString()).toBe(
            "2026-10-17T18:30:00.000Z",
        );
        // The same instant is already the 17th in Auckland.
        expect(soonCutoff(now, "Pacific/Auckland").toISOString()).toBe(
            "2026-10-18T11:00:00.000Z",
        );
    });
});

/**
 * Home A's fields on the whole read (DEC-171, Home plan U1): the tiles, the
 * groups and How it's going come beside today's fields, which read as
 * before; amounts only with `payment:read`; a failing source leaves its
 * group out and names it, and the rest still return.
 */
describe("HomeService: Home A (DEC-171)", () => {
    const VIEWS: View[] = [
        { key: "COMMERCE", label: "Sell", readiness: "ACTIVE" },
        { key: "APPOINTMENTS", label: "Appointments", readiness: "ACTIVE" },
        { key: "PAYMENTS", label: "Payments", readiness: "ACTIVE" },
    ];

    it("sends the tiles, the groups and How it's going beside today's fields", async () => {
        const home = await build(VIEWS, { orders: [OPEN_ORDER] }).build(INPUT);
        expect(home.needs.length).toBeGreaterThan(0);
        expect(home.needGroups?.map((g) => g.kind)).toEqual(["ORDERS"]);
        expect(home.needGroupsTotal).toBe(
            home.needGroups?.reduce((n, g) => n + g.count, 0),
        );
        expect(home.needGroupsTotal).toBe(home.needsTotal);
        expect(home.tiles?.toPack).toMatchObject({ count: 1 });
        expect(home.tiles?.moneyIn).toMatchObject({ totals: [], payments: 0 });
        expect(home.going).toMatchObject({ bookings: { count: 0, before: 0 } });
        // The rows keep the order's amount for the owner.
        expect(home.needGroups?.[0].rows[0].amountMinor).toBe(125_050);
        expect(home.week?.chequesWaiting).toBeNull();
    });

    it("gives a role without payment:read counts and no amounts", async () => {
        const home = await build(VIEWS, { orders: [OPEN_ORDER] }).build({
            ...INPUT,
            organizationRole: "MEMBER",
            organizationActions: new Set([
                "order:read",
                "booking:read",
                "invoice:read",
                "store:read",
            ] as const),
        });
        expect(home.tiles?.moneyIn).toBeUndefined();
        expect(home.going?.sales).toBeUndefined();
        expect(home.going?.bookings).toBeDefined();
        const orders = home.needGroups?.find((g) => g.kind === "ORDERS");
        expect(orders?.count).toBe(1);
        expect(orders?.totals).toBeNull();
        expect(orders?.oldest?.amountMinor).toBeNull();
        expect(orders?.rows[0].amountMinor).toBeNull();
        // Today's flat list is as it was (an order's money is order:read's).
        expect(home.needs[0].amountMinor).toBe(125_050);
    });

    it("leaves out the bills group when the invoices read fails, and keeps the rest", async () => {
        const service = build(VIEWS, { orders: [OPEN_ORDER] });
        const db = (
            service as unknown as {
                db: Record<string, Record<string, jest.Mock>>;
            }
        ).db;
        const boom = new Error("invoices are being migrated");
        db.invoice.count.mockRejectedValue(boom);
        db.invoice.findMany.mockRejectedValue(boom);
        const home = await service.build(INPUT);
        expect(home.unavailable).toContainEqual({
            moduleKey: "PAYMENTS",
            label: "Overdue invoices",
        });
        expect(home.needGroups?.some((g) => g.kind === "BILLS")).toBe(false);
        expect(home.needGroups?.map((g) => g.kind)).toContain("ORDERS");
        expect(home.tiles?.toPack).toBeDefined();
    });

    describe("Remind all's bills (U8)", () => {
        const BILL = {
            id: "inv_1",
            number: "RC/0056",
            status: "ISSUED",
            total: "1800.00",
            paidCents: 0,
            currency: "INR",
            dueAt: new Date("2026-09-22T00:00:00.000Z"),
            billToName: "Arjun Mehta",
            subscriptionId: null,
            contact: null,
            lines: [],
        };
        function withBill() {
            const service = build(VIEWS);
            const db = (
                service as unknown as {
                    db: Record<string, Record<string, jest.Mock>>;
                }
            ).db;
            db.invoice.count.mockResolvedValue(1);
            db.invoice.findMany.mockImplementation(
                (args: { where?: { status?: unknown; dueAt?: unknown } }) =>
                    Promise.resolve(
                        args.where?.status === "ISSUED" && args.where.dueAt
                            ? [BILL]
                            : [],
                    ),
            );
            db.message = { findMany: jest.fn().mockResolvedValue([]) };
            db.customerThreadMessage = {
                findMany: jest.fn().mockResolvedValue([]),
            };
            db.invoiceShare = { findMany: jest.fn().mockResolvedValue([]) };
            return service;
        }

        it("hands the bills group its overdue bills for someone who may send a reminder", async () => {
            const home = await withBill().build(INPUT);
            const bills = home.needGroups?.find((g) => g.kind === "BILLS");
            expect(bills?.remind).toEqual({
                invoiceIds: ["inv_1"],
                quietDays: 3,
            });
        });

        it("sends no Remind all to a role without invoice:write", async () => {
            const home = await withBill().build({
                ...INPUT,
                organizationRole: "MEMBER",
                organizationActions: new Set([
                    "invoice:read",
                    "payment:read",
                ] as const),
            });
            const bills = home.needGroups?.find((g) => g.kind === "BILLS");
            expect(bills).toBeDefined();
            expect(bills?.remind).toBeUndefined();
        });
    });

    describe("reads shared within one build (review #16)", () => {
        type Args = { where?: Record<string, unknown>; select?: object };
        function invoiceReads(service: HomeService) {
            const db = (
                service as unknown as {
                    db: Record<string, Record<string, jest.Mock>>;
                }
            ).db;
            return () =>
                db.invoice.findMany.mock.calls.map((c) => c[0] as Args);
        }

        it("reads the unpaid bills once for This week and How it's going", async () => {
            const service = build(VIEWS);
            const calls = invoiceReads(service);
            const home = await service.build(INPUT);
            // Both figures came, from the one read.
            expect(home.week).not.toBeNull();
            expect(home.going).not.toBeNull();
            const unpaidReads = calls().filter(
                (a) =>
                    a.select !== undefined &&
                    Object.keys(a.select).sort().join() ===
                        "currency,dueAt,paidCents,status,total",
            );
            expect(unpaidReads).toHaveLength(1);
        });

        it("works the overdue bills' where out once for the row and Remind all", async () => {
            const service = build(VIEWS);
            const db = (
                service as unknown as {
                    db: Record<string, Record<string, jest.Mock>>;
                }
            ).db;
            db.invoice.count.mockResolvedValue(1);
            db.invoice.findMany.mockImplementation((args: Args) =>
                Promise.resolve(
                    args.where?.status === "ISSUED" && args.where.dueAt
                        ? [
                              {
                                  id: "inv_1",
                                  number: "RC/0056",
                                  status: "ISSUED",
                                  total: "1800.00",
                                  paidCents: 0,
                                  currency: "INR",
                                  dueAt: new Date("2026-09-22T00:00:00.000Z"),
                                  billToName: "Arjun Mehta",
                                  subscriptionId: null,
                                  contact: null,
                                  lines: [],
                              },
                          ]
                        : [],
                ),
            );
            db.message = { findMany: jest.fn().mockResolvedValue([]) };
            db.customerThreadMessage = {
                findMany: jest.fn().mockResolvedValue([]),
            };
            db.invoiceShare = { findMany: jest.fn().mockResolvedValue([]) };
            const home = await service.build(INPUT);
            const bills = home.needGroups?.find((g) => g.kind === "BILLS");
            expect(bills?.remind?.invoiceIds).toEqual(["inv_1"]);
            // `overdueBillsWhere`'s own read: the live subscriptions' bills.
            const whereReads = invoiceReads(service)().filter(
                (a) =>
                    a.select !== undefined &&
                    Object.keys(a.select).sort().join() === "id,subscriptionId",
            );
            expect(whereReads).toHaveLength(1);
        });
    });

    describe("the rail's read (review #16)", () => {
        it("sends the ranked actions alone, as the full build ranks them", async () => {
            const service = build(VIEWS, { orders: [OPEN_ORDER] });
            const rail = await service.rail(INPUT);
            const home = await build(VIEWS, { orders: [OPEN_ORDER] }).build(
                INPUT,
            );
            expect(Object.keys(rail).sort()).toEqual([
                "actions",
                "unavailable",
            ]);
            expect(
                rail.actions.map((a) => [a.code, a.severity, a.count]),
            ).toEqual(home.actions.map((a) => [a.code, a.severity, a.count]));
            expect(rail.actions.map((a) => a.code)).toContain(
                "COMMERCE_OPEN_ORDERS",
            );
            // A source that failed is named as the full build names it.
            expect(home.unavailable).toEqual(
                expect.arrayContaining(rail.unavailable),
            );
        });

        it("asks none of the sources only Home's page draws", async () => {
            const service = build(VIEWS, { orders: [OPEN_ORDER] });
            const db = (
                service as unknown as {
                    db: Record<string, Record<string, jest.Mock>>;
                }
            ).db;
            await service.rail(INPUT);
            // The schedule, Today, This week, How it's going and bookings
            // awaiting payment all read bookings; the rail reads none.
            expect(db.booking.count).not.toHaveBeenCalled();
            expect(db.booking.findMany).not.toHaveBeenCalled();
            // Nor the unpaid bills This week and How it's going fold.
            const unpaidReads = db.invoice.findMany.mock.calls.filter(
                ([a]) =>
                    (a as { select?: object }).select !== undefined &&
                    Object.keys((a as { select: object }).select)
                        .sort()
                        .join() === "currency,dueAt,paidCents,status,total",
            );
            expect(unpaidReads).toHaveLength(0);
        });

        it("names a failed action source, as the full build does", async () => {
            const service = build(VIEWS, { orders: [OPEN_ORDER] });
            const db = (
                service as unknown as {
                    db: Record<string, Record<string, jest.Mock>>;
                }
            ).db;
            db.order.count.mockRejectedValue(new Error("down"));
            db.order.findMany.mockRejectedValue(new Error("down"));
            const rail = await service.rail(INPUT);
            expect(rail.unavailable).toContainEqual({
                moduleKey: "COMMERCE",
                label: "Open orders",
            });
            expect(rail.actions.map((a) => a.code)).not.toContain(
                "COMMERCE_OPEN_ORDERS",
            );
        });

        it("reads nothing for a Reviewer", async () => {
            const service = build(VIEWS);
            const rail = await service.rail({
                ...INPUT,
                organizationRole: "REVIEWER",
            });
            expect(rail).toEqual({ actions: [], unavailable: [] });
        });
    });

    it("sends no To pack tile when the open orders read failed", async () => {
        const service = build(VIEWS, { orders: [OPEN_ORDER] });
        const db = (
            service as unknown as {
                db: Record<string, Record<string, jest.Mock>>;
            }
        ).db;
        db.order.count.mockRejectedValue(new Error("down"));
        db.order.findMany.mockRejectedValue(new Error("down"));
        const home = await service.build(INPUT);
        expect(home.tiles?.toPack).toBeUndefined();
        expect(home.needGroups?.some((g) => g.kind === "ORDERS")).toBe(false);
    });

    it("sends a Reviewer none of it", async () => {
        const home = await build(VIEWS).build({
            ...INPUT,
            organizationRole: "REVIEWER",
        });
        expect(home.tiles).toBeUndefined();
        expect(home.needGroups).toBeUndefined();
        expect(home.going).toBeUndefined();
    });
});
