import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { OrgAction } from "../organizations/organization-actions";
import type { TodayBookingRow, TodayOrderRow } from "./home-today";
import {
    bookingItems,
    businessDay,
    pickUpItems,
    readToday,
    todayScope,
} from "./home-today";
import { HomeService } from "./home.service";

/**
 * Home's Today column (round 2, F5): the business's day in its own zone,
 * bookings one row each, a class one row for all its places, pick-ups at the
 * time they should be ready, and Arrived with the time it was said. Mocked
 * Prisma; `home.today.db.spec.ts` runs the query against Postgres.
 */

const ZONE = "Asia/Kolkata";
// 09:30 in Mumbai on 18 Sep 2026.
const NOW = new Date("2026-09-18T04:00:00.000Z");
const at = (hhmm: string) => new Date(`2026-09-18T${hhmm}:00+05:30`);

function booking(over: Partial<TodayBookingRow> = {}): TodayBookingRow {
    return {
        id: "bk_1",
        startAt: at("10:00"),
        outcome: null,
        paidWith: null,
        contactId: "c_1",
        bookerName: null,
        bookerEmail: null,
        service: { id: "svc_clean", name: "Cleaning", capacity: 1 },
        staff: { name: "Dr. Arun" },
        contact: { firstName: "Farah", lastName: "Khan", email: "f@x.in" },
        events: [],
        ...over,
    };
}

function order(over: Partial<TodayOrderRow> = {}): TodayOrderRow {
    return {
        id: "ord_1",
        orderId: "1042",
        storeId: "st_1",
        createdAt: at("08:15"),
        stage: "PREPARING",
        fulfilment: "COLLECT",
        paymentStatus: "PAID",
        customer: { firstName: "Anika", lastName: "Rao", email: "a@x.in" },
        ...over,
    };
}

const VIEW = { zone: ZONE, canMark: true, flags: new Map<string, string[]>() };

describe("businessDay", () => {
    it("is the business's date, not UTC's", () => {
        // 23:30 in Mumbai is 18:00 UTC: still the 18th there.
        const late = new Date("2026-09-18T18:00:00.000Z");
        expect(businessDay(late, ZONE).date).toBe("2026-09-18");
        // 00:30 in Mumbai on the 19th is the 18th in UTC.
        const early = new Date("2026-09-18T19:00:00.000Z");
        expect(businessDay(early, ZONE).date).toBe("2026-09-19");
    });

    it("runs from midnight to midnight in the zone", () => {
        const day = businessDay(NOW, ZONE);
        expect(day.start.toISOString()).toBe("2026-09-17T18:30:00.000Z");
        expect(day.end.toISOString()).toBe("2026-09-18T18:30:00.000Z");
    });
});

describe("bookingItems", () => {
    it("gives a one-to-one booking its own row, in the business's clock", () => {
        const [item] = bookingItems(
            [booking({ paidWith: "DESK", startAt: at("23:30") })],
            VIEW,
        );
        expect(item).toMatchObject({
            id: "bk_1",
            kind: "BOOKING",
            time: "23:30",
            what: "Cleaning · Farah Khan",
            who: "With Dr. Arun · pays at the desk",
            person: "Farah Khan",
            outcome: null,
            outcomeTime: null,
            href: "/bookings/bk_1",
            markable: true,
        });
    });

    it("tags an arrived booking with the time it was said", () => {
        const [item] = bookingItems(
            [
                booking({
                    outcome: "ATTENDED",
                    events: [{ type: "ATTENDED", createdAt: at("09:32") }],
                }),
            ],
            VIEW,
        );
        expect(item.outcome).toBe("ATTENDED");
        expect(item.outcomeTime).toBe("09:32");
    });

    it("takes the time from the newest event of the outcome it has now", () => {
        // Marked a no-show by mistake, then corrected to attended.
        const [item] = bookingItems(
            [
                booking({
                    outcome: "ATTENDED",
                    events: [
                        { type: "ATTENDED", createdAt: at("09:40") },
                        { type: "NO_SHOW", createdAt: at("09:35") },
                    ],
                }),
            ],
            VIEW,
        );
        expect(item.outcomeTime).toBe("09:40");
    });

    it("folds a class's places into one row that counts them", () => {
        const yoga = { id: "svc_yoga", name: "Morning Yoga", capacity: 16 };
        const items = bookingItems(
            [
                booking({ id: "a", service: yoga, startAt: at("07:00") }),
                booking({ id: "b", service: yoga, startAt: at("07:00") }),
                booking({ id: "c", service: yoga, startAt: at("07:00") }),
                booking({ id: "d", service: yoga, startAt: at("18:00") }),
            ],
            VIEW,
        );
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
            kind: "CLASS",
            time: "07:00",
            what: "Morning Yoga class",
            who: "With Dr. Arun · 3 of 16 booked",
            markable: false,
            href: "/bookings",
        });
        expect(items[1].who).toBe("With Dr. Arun · 1 of 16 booked");
    });

    it("doesn't say 'class' twice", () => {
        const [item] = bookingItems(
            [
                booking({
                    service: { id: "s", name: "Spin class", capacity: 12 },
                    staff: null,
                }),
            ],
            VIEW,
        );
        expect(item.what).toBe("Spin class");
        expect(item.who).toBe("1 of 12 booked");
    });

    it("falls back to the booker's name, then nothing", () => {
        const [named, bare] = bookingItems(
            [
                booking({ contact: null, contactId: null, bookerName: "Sam" }),
                booking({
                    id: "bk_2",
                    contact: null,
                    contactId: null,
                    staff: null,
                }),
            ],
            VIEW,
        );
        expect(named.what).toBe("Cleaning · Sam");
        expect(bare.what).toBe("Cleaning");
        expect(bare.who).toBeNull();
    });

    it("carries the person's attention labels it was given", () => {
        const [item] = bookingItems([booking()], {
            ...VIEW,
            flags: new Map([["c_1", ["Nut allergy"]]]),
        });
        expect(item.flags).toEqual(["Nut allergy"]);
    });

    it("is read-only without booking:write", () => {
        const [item] = bookingItems([booking()], { ...VIEW, canMark: false });
        expect(item.markable).toBe(false);
    });
});

describe("pickUpItems", () => {
    const day = businessDay(NOW, ZONE);

    it("places a pick-up at the time it should be ready", () => {
        const [item] = pickUpItems([order()], day, ZONE);
        expect(item).toMatchObject({
            id: "ord_1",
            kind: "PICKUP",
            // Placed 08:15, two hours to be ready.
            time: "10:15",
            what: "Pick-up · Anika Rao",
            who: "Order #1042 · Being made",
            stage: "PREPARING",
            href: "/commerce/orders/ord_1?storefront=st_1",
            markable: false,
        });
    });

    it("reads both fulfilment vocabularies as pick-up, and not delivery", () => {
        const items = pickUpItems(
            [
                order({ id: "old", fulfilment: "COLLECT" }),
                order({ id: "new", fulfilment: "PICKUP" }),
                order({ id: "del", fulfilment: "DELIVERY" }),
            ],
            day,
            ZONE,
        );
        expect(items.map((i) => i.id)).toEqual(["old", "new"]);
    });

    it("leaves out one due another day, and one refunded", () => {
        const items = pickUpItems(
            [
                // Ready at 00:30 on the 19th.
                order({ id: "tomorrow", createdAt: at("22:30") }),
                // Ready at 23:00 on the 17th.
                order({
                    id: "yesterday",
                    createdAt: new Date("2026-09-17T21:00:00+05:30"),
                }),
                order({ id: "refunded", paymentStatus: "REFUNDED" }),
            ],
            day,
            ZONE,
        );
        expect(items).toEqual([]);
    });

    it("says an order is ready to hand over", () => {
        const [item] = pickUpItems([order({ stage: "READY" })], day, ZONE);
        expect(item.who).toBe("Order #1042 · Ready");
    });
});

describe("todayScope", () => {
    const input = (actions: OrgAction[]) => ({
        organizationId: "org_1",
        organizationRole: "MEMBER" as const,
        organizationActions: new Set(actions),
    });
    const both = new Set(["APPOINTMENTS", "COMMERCE"]);

    it("reads nothing for someone who reads neither bookings nor orders", () => {
        expect(todayScope(input(["contact:read"]), both)).toBeNull();
    });

    it("reads nothing from a module that is off", () => {
        expect(todayScope(input(["booking:read"]), new Set())).toBeNull();
    });

    it("gives each part its own read", () => {
        expect(
            todayScope(input(["booking:read", "order:stage"]), both),
        ).toEqual({
            bookings: true,
            pickUps: true,
            canMark: false,
            flags: false,
        });
        expect(
            todayScope(
                input(["booking:read", "booking:write", "contact:read"]),
                both,
            ),
        ).toEqual({
            bookings: true,
            pickUps: false,
            canMark: true,
            flags: true,
        });
    });
});

describe("readToday", () => {
    function db(bookings: TodayBookingRow[], orders: TodayOrderRow[] = []) {
        return {
            booking: { findMany: jest.fn().mockResolvedValue(bookings) },
            order: { findMany: jest.fn().mockResolvedValue(orders) },
            contactAttention: {
                findMany: jest.fn().mockResolvedValue([]),
                groupBy: jest.fn().mockResolvedValue([]),
            },
            user: { findMany: jest.fn().mockResolvedValue([]) },
        };
    }
    const INPUT = {
        organizationId: "org_1",
        organizationRole: "OWNER" as const,
    };
    const ALL = { bookings: true, pickUps: true, canMark: true, flags: true };

    it("asks for standing bookings inside the business's day", async () => {
        const client = db([]);
        await readToday(client as never, INPUT, ALL, { now: NOW, zone: ZONE });
        const where = client.booking.findMany.mock.calls[0][0].where;
        expect(where).toMatchObject({
            organizationId: "org_1",
            status: "CONFIRMED",
            startAt: {
                gte: new Date("2026-09-17T18:30:00.000Z"),
                lt: new Date("2026-09-18T18:30:00.000Z"),
            },
        });
    });

    it("puts bookings and pick-ups in one time order", async () => {
        const client = db(
            [
                booking({ id: "b11", startAt: at("11:00") }),
                booking({ id: "b09", startAt: at("09:00") }),
            ],
            [order()],
        );
        const today = await readToday(client as never, INPUT, ALL, {
            now: NOW,
            zone: ZONE,
        });
        expect(today.date).toBe("2026-09-18");
        expect(today.bookings).toBe(true);
        expect(today.items.map((i) => i.time)).toEqual([
            "09:00",
            "10:15",
            "11:00",
        ]);
    });

    it("reads no bookings, orders or notes it has no scope for", async () => {
        const client = db([booking()], [order()]);
        const today = await readToday(
            client as never,
            INPUT,
            { bookings: false, pickUps: false, canMark: false, flags: false },
            { now: NOW, zone: ZONE },
        );
        expect(client.booking.findMany).not.toHaveBeenCalled();
        expect(client.order.findMany).not.toHaveBeenCalled();
        expect(client.contactAttention.findMany).not.toHaveBeenCalled();
        expect(today).toMatchObject({ bookings: false, items: [] });
    });

    it("hides a sensitive note from someone who may not read it", async () => {
        const client = db([booking()]);
        await readToday(
            client as never,
            {
                organizationId: "org_1",
                organizationRole: "MEMBER",
                organizationActions: new Set<OrgAction>([
                    "booking:read",
                    "contact:read",
                ]),
            },
            { ...ALL, canMark: false },
            { now: NOW, zone: ZONE },
        );
        expect(
            client.contactAttention.findMany.mock.calls[0][0].where,
        ).toMatchObject({ contactId: { in: ["c_1"] }, sensitive: false });
    });
});

describe("HomeService: the today block", () => {
    function home(views: string[], bookings: TodayBookingRow[]) {
        const availability = {
            listViews: jest.fn().mockResolvedValue(
                views.map((key) => ({
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
        const db = {
            booking: {
                count: jest.fn().mockResolvedValue(0),
                // The schedule's read and Today's read, told apart by `select`.
                findMany: jest.fn((args: { select?: unknown }) =>
                    Promise.resolve(args.select ? bookings : []),
                ),
            },
            order: empty,
            invoice: empty,
            paymentIntent: empty,
            site: empty,
            activity: empty,
            lead: empty,
            contact: empty,
            contactAttention: {
                findMany: jest.fn().mockResolvedValue([]),
                groupBy: jest.fn().mockResolvedValue([]),
            },
            user: empty,
            businessProfile: {
                findUnique: jest.fn().mockResolvedValue({ timezone: ZONE }),
            },
        };
        return new HomeService(availability, db as never);
    }
    const OWNER = {
        organizationId: "org_1",
        organizationRole: "OWNER" as const,
    };

    it("sends today's bookings to someone who reads them", async () => {
        const model = await home(["APPOINTMENTS"], [booking()]).build(OWNER);
        expect(model.today?.bookings).toBe(true);
        expect(model.today?.items.map((i) => i.id)).toEqual(["bk_1"]);
        expect(model.unavailable).toEqual([]);
    });

    it("sends no today block to a business without bookings or orders", async () => {
        const model = await home(["CRM"], [booking()]).build(OWNER);
        expect(model.today).toBeNull();
    });
});
