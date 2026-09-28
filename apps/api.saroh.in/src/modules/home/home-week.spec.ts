import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { OrgAction } from "../organizations/organization-actions";
import type { HomeInput } from "./home-model";
import {
    compareTakings,
    paidBetweenWhere,
    readWeek,
    refundedBetweenWhere,
    takingsFigures,
    weekScope,
    weekWindows,
    windowMoney,
} from "./home-week";
import { HomeService } from "./home.service";

/**
 * Home's "This week" (round 2, F7): takings so far against the same days
 * last week, the week's bookings and orders, and what is owed — each figure
 * for whoever holds its read, and absent otherwise. Mocked Prisma;
 * `home.week.db.spec.ts` runs the reads against Postgres.
 */

const ZONE = "Asia/Kolkata";
// Friday 18 Sep 2026, 09:30 in Mumbai.
const NOW = new Date("2026-09-18T04:00:00.000Z");
// Monday 14 Sep, 00:00 in Mumbai.
const MONDAY = "2026-09-13T18:30:00.000Z";
const ALL = new Set(["COMMERCE", "APPOINTMENTS", "PAYMENTS"]);

const owner: HomeInput = { organizationId: "org_1", organizationRole: "OWNER" };
const member: HomeInput = {
    organizationId: "org_1",
    organizationRole: "MEMBER",
};
const holding = (actions: OrgAction[]): HomeInput => ({
    organizationId: "org_1",
    organizationRole: "MEMBER",
    organizationActions: new Set(actions),
});

type Sum = { currency: string; total: string; count: number };
const grouped = (rows: Sum[]) =>
    rows.map((r) => ({
        currency: r.currency,
        _sum: { total: r.total },
        _count: { _all: r.count },
    }));

describe("weekWindows", () => {
    it("starts the week on Monday in the business's zone, and compares the same days so far", () => {
        const w = weekWindows(NOW, ZONE);
        expect(w.startDate).toBe("2026-09-14");
        expect(w.start.toISOString()).toBe(MONDAY);
        expect(w.end.toISOString()).toBe("2026-09-20T18:30:00.000Z");
        expect(w.lastStart.toISOString()).toBe("2026-09-06T18:30:00.000Z");
        // Friday 11 Sep, 09:30 in Mumbai.
        expect(w.lastSoFar.toISOString()).toBe("2026-09-11T04:00:00.000Z");
    });

    it("keeps a Sunday night in its own week, and a Monday past midnight in the next", () => {
        // 23:50 Sunday 20 Sep in Mumbai.
        const sunday = weekWindows(new Date("2026-09-20T18:20:00.000Z"), ZONE);
        expect(sunday.startDate).toBe("2026-09-14");
        // 00:10 Monday 21 Sep in Mumbai, still Sunday in UTC.
        const monday = weekWindows(new Date("2026-09-20T18:40:00.000Z"), ZONE);
        expect(monday.startDate).toBe("2026-09-21");
        expect(monday.start.toISOString()).toBe("2026-09-20T18:30:00.000Z");
    });
});

describe("compareTakings", () => {
    it("says up, down or level by a whole percent", () => {
        // ₹18,450 against ₹16,470: up 12%.
        expect(compareTakings(1_845_000, 1_647_000, 6)).toEqual({
            kind: "UP",
            percent: 12,
        });
        expect(compareTakings(900_000, 1_000_000, 4)).toEqual({
            kind: "DOWN",
            percent: 10,
        });
        expect(compareTakings(1_000_400, 1_000_000, 4)).toEqual({
            kind: "LEVEL",
            percent: 0,
        });
    });

    it("won't compare against fewer than three payments last week", () => {
        expect(compareTakings(500_000, 400_000, 2)).toEqual({ kind: "THIN" });
        expect(compareTakings(500_000, 400_000, 3)).toEqual({
            kind: "UP",
            percent: 25,
        });
    });

    it("won't compare against a last week under a quarter of this one", () => {
        expect(compareTakings(1_000_000, 240_000, 5)).toEqual({
            kind: "THIN",
        });
        expect(compareTakings(1_000_000, 250_000, 5)).toEqual({
            kind: "UP",
            percent: 300,
        });
    });

    it("won't compare against nothing, or against a week of refunds", () => {
        expect(compareTakings(100_000, 0, 5)).toEqual({ kind: "THIN" });
        expect(compareTakings(100_000, -5_000, 5)).toEqual({ kind: "THIN" });
    });
});

describe("the money this week", () => {
    it("takes a refund off the week it was made in, per currency", () => {
        const money = windowMoney(
            grouped([
                { currency: "INR", total: "12000.50", count: 4 },
                { currency: "USD", total: "20", count: 1 },
            ]),
            grouped([{ currency: "INR", total: "500", count: 1 }]),
        );
        expect(money.net).toEqual(
            new Map([
                ["INR", 1_150_050],
                ["USD", 2_000],
            ]),
        );
        expect(money.payments).toEqual(
            new Map([
                ["INR", 4],
                ["USD", 1],
            ]),
        );
    });

    it("counts paid invoices once — an order's own included, credit notes never, a booking's unpaid hold never", () => {
        const where = paidBetweenWhere("org_1", new Date(MONDAY), NOW);
        expect(where).toEqual({
            organizationId: "org_1",
            paidAt: { gte: new Date(MONDAY), lt: NOW },
            kind: { not: "CREDIT_NOTE" },
            NOT: { source: "BOOKING", number: null },
        });
        // No `orderId: null`: an order's money is its invoice (ADR-008),
        // and nothing else counts it.
        expect(where).not.toHaveProperty("orderId");
    });

    it("counts as refunded only a credit note that gave money back", () => {
        expect(refundedBetweenWhere("org_1", new Date(MONDAY), NOW)).toEqual({
            organizationId: "org_1",
            kind: "CREDIT_NOTE",
            status: { notIn: ["DRAFT", "VOID"] },
            issuedAt: { gte: new Date(MONDAY), lt: NOW },
            OR: [
                { orderId: { not: null } },
                { paymentRefundId: { not: null } },
            ],
        });
    });

    it("compares each currency with its own last week", () => {
        const thisWeek = windowMoney(
            grouped([
                { currency: "USD", total: "20", count: 1 },
                { currency: "INR", total: "11000", count: 5 },
            ]),
            [],
        );
        const lastWeek = windowMoney(
            grouped([{ currency: "INR", total: "10000", count: 4 }]),
            [],
        );
        expect(takingsFigures(thisWeek, lastWeek, "/x")).toEqual([
            {
                currency: "INR",
                amountMinor: 1_100_000,
                lastWeekMinor: 1_000_000,
                change: { kind: "UP", percent: 10 },
                href: "/x",
            },
            {
                currency: "USD",
                amountMinor: 2_000,
                lastWeekMinor: 0,
                change: { kind: "THIN" },
                href: "/x",
            },
        ]);
    });
});

describe("weekScope", () => {
    it("gives an owner every figure", () => {
        expect(weekScope(owner, ALL)).toEqual({
            takings: true,
            bookings: true,
            orders: true,
            owed: true,
        });
    });

    it("gives a Member no takings and nothing owed, but their bookings and orders", () => {
        expect(weekScope(member, ALL)).toEqual({
            takings: false,
            bookings: true,
            orders: true,
            owed: false,
        });
    });

    it("asks for both money reads before takings", () => {
        // `payment:read` alone reads no figure here: the takings' rows are
        // invoices.
        expect(weekScope(holding(["payment:read"]), ALL)).toBeNull();
        expect(
            weekScope(holding(["payment:read", "invoice:read"]), ALL),
        ).toEqual({
            takings: true,
            bookings: false,
            orders: false,
            owed: true,
        });
    });

    it("leaves out a figure whose module is off", () => {
        expect(weekScope(owner, new Set(["APPOINTMENTS"]))).toEqual({
            takings: false,
            bookings: true,
            orders: false,
            owed: false,
        });
    });

    it("gives no block to a Reviewer, or to someone who reads none of it", () => {
        expect(
            weekScope(
                { organizationId: "org_1", organizationRole: "REVIEWER" },
                ALL,
            ),
        ).toBeNull();
        expect(weekScope(holding(["org:read"]), ALL)).toBeNull();
    });
});

function db(
    over: {
        paid?: Sum[][];
        refunded?: Sum[][];
        bookings?: number[];
        orders?: number;
        owed?: Sum[];
        overdue?: number;
        billed?: boolean;
    } = {},
) {
    const paid = [...(over.paid ?? [[], []])];
    const refunded = [...(over.refunded ?? [[], []])];
    const bookings = [...(over.bookings ?? [0, 0])];
    return {
        invoice: {
            groupBy: jest.fn((args: { where: { kind?: unknown } }) => {
                if (args.where.kind === "CREDIT_NOTE") {
                    return Promise.resolve(grouped(refunded.shift() ?? []));
                }
                if ((args.where as { status?: unknown }).status === "ISSUED") {
                    return Promise.resolve(grouped(over.owed ?? []));
                }
                return Promise.resolve(grouped(paid.shift() ?? []));
            }),
            count: jest.fn().mockResolvedValue(over.overdue ?? 0),
            findFirst: jest
                .fn()
                .mockResolvedValue(over.billed ? { id: "inv_1" } : null),
        },
        booking: {
            // The week's two counts are bounded both ends; Home's other
            // booking counts (the schedule, the last 24 hours) aren't.
            count: jest.fn((args: { where: { startAt?: { lt?: Date } } }) =>
                Promise.resolve(
                    args.where.startAt?.lt ? (bookings.shift() ?? 0) : 0,
                ),
            ),
        },
        order: { count: jest.fn().mockResolvedValue(over.orders ?? 0) },
    };
}

const EVERY = { takings: true, bookings: true, orders: true, owed: true };
const clock = { now: NOW, zone: ZONE };

describe("readWeek", () => {
    it("sends each figure with the link that opens its rows", async () => {
        const client = db({
            paid: [
                [{ currency: "INR", total: "18450", count: 9 }],
                [{ currency: "INR", total: "16470", count: 7 }],
            ],
            refunded: [[], []],
            bookings: [14, 11],
            orders: 23,
            owed: [{ currency: "INR", total: "6400", count: 3 }],
            overdue: 1,
            billed: true,
        });
        const week = await readWeek(client as never, "org_1", EVERY, clock);
        const since = encodeURIComponent(MONDAY);
        expect(week).toEqual({
            zone: ZONE,
            startDate: "2026-09-14",
            takings: [
                {
                    currency: "INR",
                    amountMinor: 1_845_000,
                    lastWeekMinor: 1_647_000,
                    change: { kind: "UP", percent: 12 },
                    href: `/billing/invoices?since=${since}`,
                },
            ],
            bookings: { count: 14, lastWeek: 11, href: "/bookings" },
            orders: { count: 23, href: `/commerce/orders?since=${since}` },
            owed: {
                totals: [{ currency: "INR", amountMinor: 640_000 }],
                bills: 3,
                overdue: 1,
                href: "/billing/invoices?view=overdue",
            },
        });
    });

    it("lowers takings by a refund made this week", async () => {
        const client = db({
            paid: [
                [{ currency: "INR", total: "10000", count: 5 }],
                [{ currency: "INR", total: "10000", count: 5 }],
            ],
            refunded: [[{ currency: "INR", total: "1000", count: 1 }], []],
        });
        const week = await readWeek(
            client as never,
            "org_1",
            { ...EVERY, bookings: false, orders: false, owed: false },
            clock,
        );
        expect(week.takings).toEqual([
            expect.objectContaining({
                amountMinor: 900_000,
                change: { kind: "DOWN", percent: 10 },
            }),
        ]);
    });

    it("measures this week to now and last week to the same moment", async () => {
        const client = db();
        await readWeek(client as never, "org_1", EVERY, clock);
        const paidWheres = client.invoice.groupBy.mock.calls
            .map(([args]) => args.where as { paidAt?: unknown })
            .filter((w) => w.paidAt);
        expect(paidWheres.map((w) => w.paidAt)).toEqual([
            { gte: new Date(MONDAY), lt: NOW },
            {
                gte: new Date("2026-09-06T18:30:00.000Z"),
                lt: new Date("2026-09-11T04:00:00.000Z"),
            },
        ]);
        // Bookings: the whole of each week, Monday to Monday.
        expect(
            client.booking.count.mock.calls.map(
                ([args]: [{ where: { startAt: unknown } }]) =>
                    args.where.startAt,
            ),
        ).toEqual([
            {
                gte: new Date(MONDAY),
                lt: new Date("2026-09-20T18:30:00.000Z"),
            },
            {
                gte: new Date("2026-09-06T18:30:00.000Z"),
                lt: new Date(MONDAY),
            },
        ]);
    });

    it("sends an empty takings list for a week with nothing in, not a missing one", async () => {
        const week = await readWeek(
            db() as never,
            "org_1",
            { ...EVERY, owed: false },
            clock,
        );
        expect(week.takings).toEqual([]);
    });

    it("sends nothing owed for a business that has never billed outside an order", async () => {
        const week = await readWeek(db() as never, "org_1", EVERY, clock);
        expect(week).not.toHaveProperty("owed");
    });

    it("links owed to the issued bills when none is overdue", async () => {
        const week = await readWeek(
            db({ billed: true }) as never,
            "org_1",
            EVERY,
            clock,
        );
        expect(week.owed).toEqual({
            totals: [],
            bills: 0,
            overdue: 0,
            href: "/billing/invoices?view=issued",
        });
    });

    it("reads no money at all for a Member, and still their bookings", async () => {
        const client = db({ bookings: [4, 6], orders: 2 });
        const week = await readWeek(
            client as never,
            "org_1",
            weekScope(member, ALL) ?? EVERY,
            clock,
        );
        expect(client.invoice.groupBy).not.toHaveBeenCalled();
        expect(client.invoice.count).not.toHaveBeenCalled();
        expect(client.invoice.findFirst).not.toHaveBeenCalled();
        expect(week).not.toHaveProperty("takings");
        expect(week).not.toHaveProperty("owed");
        expect(week.bookings).toEqual({
            count: 4,
            lastWeek: 6,
            href: "/bookings",
        });
        expect(week.orders?.count).toBe(2);
    });
});

describe("HomeService: This week", () => {
    function home(client: ReturnType<typeof db>, fail = false) {
        const availability = {
            listViews: jest.fn().mockResolvedValue(
                [...ALL].map((key) => ({
                    key,
                    label: key,
                    readiness: "ACTIVE",
                    blockers: [],
                })),
            ),
        } as unknown as ModuleAvailabilityService;
        const empty = {
            count: jest.fn().mockResolvedValue(0),
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest.fn().mockResolvedValue(null),
            groupBy: jest.fn().mockResolvedValue([]),
        };
        if (fail) {
            client.booking.count = jest
                .fn()
                .mockRejectedValue(new Error("relation is being migrated"));
        }
        const full = {
            order: { ...empty, ...client.order },
            booking: { ...empty, ...client.booking },
            invoice: { ...empty, ...client.invoice, findMany: empty.findMany },
            productReview: empty,
            activity: empty,
            paymentIntent: empty,
            site: empty,
            $queryRaw: jest.fn().mockResolvedValue([]),
            businessProfile: {
                findUnique: jest.fn().mockResolvedValue({ timezone: ZONE }),
            },
        };
        return new HomeService(availability, full as never);
    }

    beforeEach(() => {
        jest.useFakeTimers({
            now: NOW,
            doNotFake: ["nextTick", "setImmediate"],
        });
    });
    afterEach(() => jest.useRealTimers());

    it("sends an owner the whole week", async () => {
        const model = await home(
            db({
                paid: [[{ currency: "INR", total: "500", count: 1 }], []],
                bookings: [3, 2],
                orders: 5,
            }),
        ).build(owner);
        expect(model.week).toMatchObject({
            zone: ZONE,
            startDate: "2026-09-14",
            takings: [expect.objectContaining({ amountMinor: 50_000 })],
            bookings: { count: 3, lastWeek: 2 },
            orders: { count: 5 },
        });
    });

    it("sends a Member no takings figure at all, and their bookings still", async () => {
        const model = await home(db({ bookings: [3, 2], orders: 5 })).build(
            member,
        );
        expect(model.week).not.toHaveProperty("takings");
        expect(model.week).not.toHaveProperty("owed");
        expect(model.week?.bookings).toMatchObject({ count: 3 });
        expect(JSON.stringify(model.week)).not.toContain("amountMinor");
    });

    it("sends no block to someone who reads none of it", async () => {
        const model = await home(db()).build(holding(["org:read"]));
        expect(model.week).toBeNull();
    });

    it("names This week when its read fails, and keeps the rest of Home", async () => {
        const model = await home(db(), true).build(owner);
        expect(model.week).toBeNull();
        expect(model.unavailable).toContainEqual({
            moduleKey: "HOME",
            label: "This week",
        });
        expect(model.view).toBe("business");
    });

    it("never reads the week for a Reviewer", async () => {
        const client = db();
        const service = home(client);
        (service as unknown as { db: Record<string, unknown> }).db = {
            ...(service as unknown as { db: Record<string, unknown> }).db,
            siteReviewer: { findMany: jest.fn().mockResolvedValue([]) },
        };
        const model = await service.build({
            organizationId: "org_1",
            userId: "user_dalia",
            organizationRole: "REVIEWER",
        });
        expect(model.view).toBe("reviewer");
        expect(model).not.toHaveProperty("week");
        expect(client.invoice.groupBy).not.toHaveBeenCalled();
        expect(client.booking.count).not.toHaveBeenCalled();
        expect(client.order.count).not.toHaveBeenCalled();
    });
});
