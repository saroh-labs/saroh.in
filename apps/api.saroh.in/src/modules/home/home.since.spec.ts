import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { OrgAction } from "../organizations/organization-actions";
import {
    isFresh,
    lastDayHeader,
    partOfDay,
    readLastDay,
    readSince,
    sinceHref,
    sinceScope,
} from "./home-last-day";
import type { HomeInput } from "./home-model";
import { HomeService } from "./home.service";

/**
 * Home's header (round 2, F6): the greeting's clock in the business's zone,
 * and the "Last 24 hours" strip — each figure a link to exactly the rows it
 * counts, each asking for its own read. Mocked Prisma;
 * `home.since.db.spec.ts` runs the reads against Postgres.
 */

const ZONE = "Asia/Kolkata";
// 09:30 in Mumbai on 18 Sep 2026.
const NOW = new Date("2026-09-18T04:00:00.000Z");
const SINCE = "2026-09-17T04:00:00.000Z";
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

function db(
    over: {
        orders?: number;
        bookings?: number;
        reviews?: number;
        money?: { currency: string; total: string | null; count: number }[];
        anything?: boolean;
    } = {},
) {
    const first = jest
        .fn()
        .mockResolvedValue(over.anything ? { id: "x_1" } : null);
    return {
        order: {
            count: jest.fn().mockResolvedValue(over.orders ?? 0),
            findFirst: first,
        },
        booking: {
            count: jest.fn().mockResolvedValue(over.bookings ?? 0),
            findFirst: first,
        },
        productReview: {
            count: jest.fn().mockResolvedValue(over.reviews ?? 0),
        },
        invoice: {
            findFirst: first,
            groupBy: jest.fn().mockResolvedValue(
                (over.money ?? []).map((m) => ({
                    currency: m.currency,
                    _sum: { total: m.total },
                    _count: { _all: m.count },
                })),
            ),
        },
    };
}

describe("partOfDay and the header", () => {
    it("reads the business's clock, not UTC's", () => {
        // 04:00 UTC is 09:30 in Mumbai.
        expect(partOfDay(NOW, ZONE)).toBe("morning");
        expect(partOfDay(NOW, "UTC")).toBe("evening");
        expect(partOfDay(new Date("2026-09-18T08:30:00.000Z"), ZONE)).toBe(
            "afternoon",
        );
        expect(partOfDay(new Date("2026-09-18T13:30:00.000Z"), ZONE)).toBe(
            "evening",
        );
    });

    it("dates the header by the business's day and opens the window 24 hours back", () => {
        // 23:30 in Mumbai on the 18th is still the 18th there.
        const late = new Date("2026-09-18T18:00:00.000Z");
        expect(lastDayHeader(late, ZONE)).toEqual({
            zone: ZONE,
            date: "2026-09-18",
            partOfDay: "evening",
            since: "2026-09-17T18:00:00.000Z",
            fresh: false,
            items: [],
        });
    });

    it("puts the window on the link, after any query already there", () => {
        expect(sinceHref("/commerce/orders", SINCE)).toBe(
            "/commerce/orders?since=2026-09-17T04%3A00%3A00.000Z",
        );
        expect(sinceHref("/bookings/all?view=all", SINCE)).toBe(
            "/bookings/all?view=all&since=2026-09-17T04%3A00%3A00.000Z",
        );
    });
});

describe("sinceScope", () => {
    it("gives an owner every figure", () => {
        expect(sinceScope(owner, ALL)).toEqual({
            orders: true,
            bookings: true,
            reviews: true,
            money: true,
        });
    });

    it("gives a Member no money: they don't hold payment:read", () => {
        expect(sinceScope(member, ALL)?.money).toBe(false);
    });

    it("asks for invoice:read beside payment:read, as the rows are invoices", () => {
        const scope = sinceScope(holding(["payment:read"]), ALL);
        expect(scope).toBeNull();
        expect(
            sinceScope(holding(["payment:read", "invoice:read"]), ALL)?.money,
        ).toBe(true);
    });

    it("counts orders for the kitchen, who move them without reading them", () => {
        expect(sinceScope(holding(["order:stage"]), ALL)).toEqual({
            orders: true,
            bookings: false,
            reviews: false,
            money: false,
        });
    });

    it("reads nothing for a module that is off", () => {
        expect(sinceScope(owner, new Set(["APPOINTMENTS"]))).toEqual({
            orders: false,
            bookings: true,
            reviews: false,
            money: false,
        });
        expect(sinceScope(owner, new Set())).toBeNull();
    });

    it("gives a Reviewer no strip", () => {
        expect(
            sinceScope({ ...owner, organizationRole: "REVIEWER" }, ALL),
        ).toBeNull();
    });
});

describe("readSince", () => {
    const EVERY = { orders: true, bookings: true, reviews: true, money: true };

    it("counts each figure from the window, with the link that opens those rows", async () => {
        const client = db({
            orders: 3,
            bookings: 2,
            reviews: 1,
            money: [{ currency: "INR", total: "12400.50", count: 4 }],
        });
        const items = await readSince(client as never, "org_1", EVERY, SINCE);
        const at = "since=2026-09-17T04%3A00%3A00.000Z";
        expect(items).toEqual([
            {
                kind: "ORDERS",
                count: 3,
                amountMinor: null,
                currency: null,
                href: `/commerce/orders?${at}`,
            },
            {
                kind: "BOOKINGS",
                count: 2,
                amountMinor: null,
                currency: null,
                href: `/bookings/all?view=all&${at}`,
            },
            {
                kind: "REVIEWS",
                count: 1,
                amountMinor: null,
                currency: null,
                href: `/commerce/products?tab=reviews&${at}`,
            },
            {
                kind: "PAYMENTS",
                count: 4,
                amountMinor: 1_240_050,
                currency: "INR",
                href: `/billing/invoices?${at}`,
            },
        ]);
        const since = new Date(SINCE);
        expect(client.order.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                createdAt: { gte: since },
                // Real orders only, as the Orders list counts them (H-3).
                NOT: {
                    placedOnline: true,
                    paymentStatus: "UNPAID",
                    paymentIntents: { none: { status: "SUCCEEDED" } },
                },
            },
        });
        expect(client.booking.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                createdAt: { gte: since },
                status: "CONFIRMED",
            },
        });
        const money = client.invoice.groupBy.mock.calls[0][0];
        expect(money.where).toMatchObject({
            organizationId: "org_1",
            paidAt: { gte: since },
            kind: { not: "CREDIT_NOTE" },
        });
    });

    it("leaves out a figure that is zero, and money that nets to nothing", async () => {
        const items = await readSince(
            db({
                orders: 0,
                bookings: 2,
                money: [{ currency: "INR", total: null, count: 0 }],
            }) as never,
            "org_1",
            EVERY,
            SINCE,
        );
        expect(items.map((i) => i.kind)).toEqual(["BOOKINGS"]);
    });

    it("gives money one figure per currency it came in", async () => {
        const items = await readSince(
            db({
                money: [
                    { currency: "INR", total: "500", count: 1 },
                    { currency: "USD", total: "20", count: 1 },
                ],
            }) as never,
            "org_1",
            EVERY,
            SINCE,
        );
        expect(items.map((i) => [i.currency, i.amountMinor])).toEqual([
            ["INR", 50_000],
            ["USD", 2_000],
        ]);
    });

    it("never reads what the scope leaves out", async () => {
        const client = db({ orders: 3, money: [] });
        const items = await readSince(
            client as never,
            "org_1",
            { orders: true, bookings: false, reviews: false, money: false },
            SINCE,
        );
        expect(items.map((i) => i.kind)).toEqual(["ORDERS"]);
        expect(client.booking.count).not.toHaveBeenCalled();
        expect(client.productReview.count).not.toHaveBeenCalled();
        expect(client.invoice.groupBy).not.toHaveBeenCalled();
    });
});

describe("readLastDay", () => {
    const clock = { now: NOW, zone: ZONE };

    it("says a business with nothing yet is new, to its owner, and sends no strip", async () => {
        const client = db();
        const day = await readLastDay(client as never, owner, ALL, clock);
        expect(day.fresh).toBe(true);
        expect(day.items).toEqual([]);
        expect(client.order.count).not.toHaveBeenCalled();
    });

    it("greets a Member as usual in a new business: setting it up isn't theirs", async () => {
        const client = db({ bookings: 1 });
        const day = await readLastDay(client as never, member, ALL, clock);
        expect(day.fresh).toBe(false);
        expect(client.order.findFirst).not.toHaveBeenCalled();
    });

    it("sends an owner's strip once anything has happened", async () => {
        const client = db({ anything: true, orders: 2 });
        const day = await readLastDay(client as never, owner, ALL, clock);
        expect(day.fresh).toBe(false);
        expect(day.items.map((i) => [i.kind, i.count])).toEqual([
            ["ORDERS", 2],
        ]);
    });

    it("gives a Member's strip no payments figure", async () => {
        const client = db({
            anything: true,
            bookings: 2,
            money: [{ currency: "INR", total: "900", count: 1 }],
        });
        const day = await readLastDay(client as never, member, ALL, clock);
        expect(day.items.map((i) => i.kind)).not.toContain("PAYMENTS");
        expect(client.invoice.groupBy).not.toHaveBeenCalled();
    });

    it("isFresh is false once one paid invoice exists", async () => {
        const client = db();
        client.invoice.findFirst = jest.fn().mockResolvedValue({ id: "i_1" });
        expect(await isFresh(client as never, "org_1")).toBe(false);
    });
});

describe("HomeService: the header", () => {
    function home(client: ReturnType<typeof db>, fail = false) {
        const availability = {
            listViews: jest.fn().mockResolvedValue(
                ["COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
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
        };
        if (fail) {
            client.productReview.count = jest
                .fn()
                .mockRejectedValue(new Error("relation is being migrated"));
        }
        const full = {
            ...client,
            order: { ...empty, ...client.order, findMany: empty.findMany },
            booking: {
                ...empty,
                ...client.booking,
                findMany: empty.findMany,
            },
            invoice: { ...empty, ...client.invoice },
            // F2's low-rated reviews read the same table as the strip.
            productReview: { ...empty, ...client.productReview },
            contactAttention: empty,
            paymentIntent: empty,
            site: empty,
            // Open orders' one raw read: none open.
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

    it("sends the header in the business's day beside every old field", async () => {
        const model = await home(db({ anything: true, orders: 1 })).build(
            owner,
        );
        expect(model.lastDay).toMatchObject({
            zone: ZONE,
            date: "2026-09-18",
            partOfDay: "morning",
            since: SINCE,
            fresh: false,
        });
        expect(model.lastDay.items.map((i) => i.kind)).toEqual(["ORDERS"]);
        // Default 130: the old fields still travel.
        for (const key of [
            "actions",
            "primaryAction",
            "upcoming",
            "numbers",
            "needs",
            "today",
        ]) {
            expect(model).toHaveProperty(key);
        }
    });

    it("names the strip when its read fails, and keeps the greeting", async () => {
        const model = await home(db({ anything: true }), true).build(owner);
        expect(model.unavailable).toContainEqual({
            moduleKey: "HOME",
            label: "The last 24 hours",
        });
        expect(model.lastDay).toMatchObject({
            date: "2026-09-18",
            partOfDay: "morning",
            items: [],
        });
    });
});
