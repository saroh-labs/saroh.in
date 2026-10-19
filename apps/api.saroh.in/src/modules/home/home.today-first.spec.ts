/**
 * Home A's pure parts (DEC-171, Home plan U1): the tiles from Today's rows,
 * the last 7 days' windows by the business's calendar (a Monday never
 * compares a week that just started), the bookings awaiting payment's
 * actions per role, and how a shelf counts as running low.
 */
import { goingSales, goingWindows } from "./home-going";
import type { HomeBooking, HomeToday, HomeTodayItem } from "./home-model";
import { moneyTodayWindows } from "./home-money-today";
import type { AwaitingRow } from "./home-pending-bookings";
import { awaitingEvidence, isAwaiting } from "./home-pending-bookings";
import type { LowShelfRow } from "./home-site-stock-sources";
import { isLowShelf, leftWords, sellsWords } from "./home-site-stock-sources";
import { bookingsTile, buildTiles, cameTile } from "./home-tiles";

const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 14:30 in Mumbai.
const NOW = new Date("2026-10-19T09:00:00.000Z");

function item(
    id: string,
    startAt: string,
    over: Partial<HomeTodayItem> = {},
): HomeTodayItem {
    return {
        id,
        kind: "BOOKING",
        startAt,
        time: "00:00",
        what: `Visit ${id}`,
        who: null,
        person: `Person ${id}`,
        outcome: null,
        outcomeTime: null,
        stage: null,
        flags: [],
        href: `/bookings/${id}`,
        markable: true,
        ...over,
    };
}

function day(items: HomeTodayItem[]): HomeToday {
    return { zone: ZONE, date: "2026-10-19", bookings: true, items };
}

describe("Home A tiles", () => {
    const busy = day([
        item("a", "2026-10-19T04:00:00.000Z", { outcome: "ATTENDED" }),
        item("b", "2026-10-19T05:00:00.000Z", { outcome: "ATTENDED" }),
        item("c", "2026-10-19T06:00:00.000Z", { outcome: "NO_SHOW" }),
        item("pick", "2026-10-19T07:00:00.000Z", { kind: "PICKUP" }),
        item("d", "2026-10-19T08:30:00.000Z"),
        item("e", "2026-10-19T10:00:00.000Z", { time: "15:30" }),
        item("cls", "2026-10-19T11:00:00.000Z", { kind: "CLASS" }),
        item("f", "2026-10-19T12:00:00.000Z"),
    ]);

    it("counts today's bookings and classes, never pick-ups, and names the next", () => {
        const tile = bookingsTile(busy, [], NOW);
        expect(tile.count).toBe(7);
        expect(tile.next).toMatchObject({
            time: "15:30",
            what: "Visit e",
            date: "2026-10-19",
        });
        // e is next; the class and f follow.
        expect(tile.laterToday).toBe(2);
    });

    it("names the next day's booking on a quiet day", () => {
        const next: HomeBooking = {
            id: "bk",
            startAt: "2026-10-21T04:30:00.000Z",
            endAt: "2026-10-21T05:30:00.000Z",
            timezone: ZONE,
            serviceName: "Cleaning",
            who: "Farah Khan",
            status: "CONFIRMED",
            href: "/bookings/bk",
        };
        const tile = bookingsTile(day([]), [next], NOW);
        expect(tile).toMatchObject({
            count: 0,
            laterToday: 0,
            next: {
                date: "2026-10-21",
                time: "10:00",
                what: "Cleaning · Farah Khan",
            },
        });
    });

    it("says Came of those started, and who is next", () => {
        expect(cameTile(busy, NOW)).toEqual({
            came: 2,
            due: 4,
            total: 6,
            next: {
                time: "15:30",
                person: "Person e",
                startAt: "2026-10-19T10:00:00.000Z",
            },
            href: "/bookings",
        });
    });

    it("leaves Came out on a day with no one-to-one bookings", () => {
        const tiles = buildTiles({
            now: NOW,
            today: day([
                item("cls", "2026-10-19T11:00:00.000Z", { kind: "CLASS" }),
            ]),
            upcoming: [],
            open: null,
            moneyIn: null,
        });
        expect(tiles.bookingsToday?.count).toBe(1);
        expect(tiles.came).toBeUndefined();
        expect(tiles.toPack).toBeUndefined();
        expect(tiles.moneyIn).toBeUndefined();
    });

    it("sends no booking tiles when Today wasn't read", () => {
        const tiles = buildTiles({
            now: NOW,
            today: null,
            upcoming: [],
            open: { count: 7, later: 1, evidence: [], late: 3, dueToday: 3 },
            moneyIn: null,
        });
        expect(tiles).toEqual({
            toPack: {
                count: 7,
                dueToday: 3,
                late: 3,
                inProgress: 1,
                href: "/commerce/orders",
            },
        });
    });
});

describe("How it's going: the last 7 days against the 7 before", () => {
    it("runs Tuesday to Monday on a Monday, never a week just started", () => {
        expect(goingWindows(NOW, ZONE)).toMatchObject({
            fromDate: "2026-10-13",
            toDate: "2026-10-19",
            beforeFromDate: "2026-10-06",
            beforeToDate: "2026-10-12",
            // 00:00 IST is 18:30 UTC the day before.
            from: new Date("2026-10-12T18:30:00.000Z"),
            to: new Date("2026-10-19T18:30:00.000Z"),
            beforeFrom: new Date("2026-10-05T18:30:00.000Z"),
        });
    });

    it("turns the day at midnight in the business's zone, not UTC's", () => {
        // 00:10 IST on Tuesday 20 Oct is still Monday 19 Oct in UTC.
        const justAfter = new Date("2026-10-19T18:40:00.000Z");
        expect(goingWindows(justAfter, ZONE)).toMatchObject({
            fromDate: "2026-10-14",
            toDate: "2026-10-20",
        });
        // 23:50 IST on Monday is still Monday.
        const justBefore = new Date("2026-10-19T18:20:00.000Z");
        expect(goingWindows(justBefore, ZONE).toDate).toBe("2026-10-19");
    });

    it("compares each currency, including one only the 7 before took", () => {
        const money = (pairs: [string, number, number][]) => ({
            net: new Map(pairs.map(([c, m]) => [c, m])),
            payments: new Map(pairs.map(([c, , n]) => [c, n])),
        });
        const sales = goingSales(
            money([["INR", 4_825_000, 30]]),
            money([
                ["INR", 4_300_000, 25],
                ["USD", 10_000, 1],
            ]),
            "/billing/invoices",
        );
        expect(sales).toEqual([
            {
                currency: "INR",
                amountMinor: 4_825_000,
                beforeMinor: 4_300_000,
                change: { kind: "UP", percent: 12 },
                href: "/billing/invoices",
            },
            {
                currency: "USD",
                amountMinor: 0,
                beforeMinor: 10_000,
                change: { kind: "THIN" },
                href: "/billing/invoices",
            },
        ]);
    });

    it("reads money in today from midnight, against the same weekday last week", () => {
        expect(moneyTodayWindows(NOW, ZONE)).toEqual({
            start: new Date("2026-10-18T18:30:00.000Z"),
            lastStart: new Date("2026-10-11T18:30:00.000Z"),
            lastSoFar: new Date("2026-10-12T09:00:00.000Z"),
        });
    });
});

describe("Bookings awaiting payment", () => {
    const linked: AwaitingRow = {
        id: "bk_1",
        status: "CONFIRMED",
        startAt: new Date("2026-10-21T06:30:00.000Z"),
        holdExpiresAt: null,
        bookerName: null,
        bookerEmail: null,
        service: { name: "Cake tasting" },
        contact: { firstName: "Kavya", lastName: "Iyer", email: null },
        invoices: [{ status: "ISSUED", total: "500.00", currency: "INR" }],
    };
    const held: AwaitingRow = {
        ...linked,
        id: "bk_2",
        status: "PENDING",
        holdExpiresAt: new Date(NOW.getTime() + 10 * 60_000),
        invoices: [{ status: "DRAFT", total: "600.00", currency: "INR" }],
    };
    const OWNER = { turnDown: true, payLink: true, money: true };
    const MEMBER = { turnDown: true, payLink: false, money: false };

    it("offers the owner Send payment link, with Turn down beside it", () => {
        const ev = awaitingEvidence(linked, ZONE, OWNER);
        expect(ev).toMatchObject({
            title: "Cake tasting",
            subtitle: "Kavya Iyer",
            amountMinor: 50_000,
            currency: "INR",
            tag: "Awaiting payment",
            href: "/bookings/bk_1",
        });
        expect(ev.detail).toMatch(/^Wed 21 Oct, 12:00/);
        expect(ev.inline).toMatchObject({
            kind: "SEND_PAY_LINK",
            label: "Send payment link",
            sends: false,
            target: "bk_1",
        });
        expect(ev.second).toMatchObject({
            kind: "TURN_DOWN",
            label: "Turn down",
            sends: true,
            undoable: false,
        });
        expect(ev.second?.confirm).toContain("Kavya is told");
    });

    it("gives a Member Turn down only, and no amount", () => {
        const ev = awaitingEvidence(linked, ZONE, MEMBER);
        expect(ev.inline?.kind).toBe("TURN_DOWN");
        expect(ev.second).toBeUndefined();
        expect(ev.amountMinor).toBeNull();
        expect(ev.currency).toBeNull();
    });

    it("never offers a pay link on a booking being paid for now", () => {
        const ev = awaitingEvidence(held, ZONE, OWNER);
        expect(ev.inline).toMatchObject({ kind: "TURN_DOWN", sends: false });
        expect(ev.second).toBeUndefined();
        expect(ev.detail).toContain("paying now on your booking page");
    });

    it("leaves a row a link for someone who can't act on it", () => {
        const ev = awaitingEvidence(linked, ZONE, {
            turnDown: false,
            payLink: false,
            money: false,
        });
        expect(ev.inline).toBeUndefined();
        expect(ev.second).toBeUndefined();
    });

    it("knows what is awaiting payment", () => {
        expect(isAwaiting(linked, NOW)).toBe(true);
        expect(isAwaiting(held, NOW)).toBe(true);
        // A hold whose 15 minutes ran out holds nothing.
        expect(
            isAwaiting(
                { ...held, holdExpiresAt: new Date(NOW.getTime() - 1) },
                NOW,
            ),
        ).toBe(false);
        // A plain booking with no link out isn't waiting on money.
        expect(isAwaiting({ ...linked, invoices: [] }, NOW)).toBe(false);
    });
});

describe("Running low", () => {
    const shelf = (over: Partial<LowShelfRow> = {}): LowShelfRow => ({
        id: "sl_1",
        storeId: "st_1",
        productId: "p_1",
        variantId: null,
        onHand: 3,
        promised: 0,
        lowStockAlert: 10,
        product: {
            name: "Seeded multigrain loaf",
            _count: { variants: 0 },
            listings: [{ storeId: "st_1" }],
        },
        variant: null,
        store: { name: "Hill Road" },
        ...over,
    });

    it("is at or under its own alert, or with nothing left", () => {
        expect(isLowShelf(shelf())).toBe(true);
        expect(isLowShelf(shelf({ onHand: 10 }))).toBe(true);
        expect(isLowShelf(shelf({ onHand: 0 }))).toBe(true);
        expect(isLowShelf(shelf({ onHand: 11 }))).toBe(false);
        // What is promised to orders can't be sold.
        expect(isLowShelf(shelf({ onHand: 14, promised: 5 }))).toBe(true);
    });

    it("is never a shelf short for orders: that is the short row", () => {
        expect(isLowShelf(shelf({ onHand: 2, promised: 5 }))).toBe(false);
    });

    it("is never a product with sizes' own shelf, nor one not sold there", () => {
        expect(
            isLowShelf(
                shelf({
                    product: {
                        name: "Tee",
                        _count: { variants: 2 },
                        listings: [{ storeId: "st_1" }],
                    },
                }),
            ),
        ).toBe(false);
        expect(
            isLowShelf(
                shelf({
                    product: {
                        name: "Tee",
                        _count: { variants: 0 },
                        listings: [{ storeId: "st_2" }],
                    },
                }),
            ),
        ).toBe(false);
    });

    it("says how fast it sells, and nothing when it didn't", () => {
        expect(sellsWords(63)).toBe("sells about 9 a day");
        expect(sellsWords(3)).toBe("3 sold in the last 7 days");
        expect(sellsWords(0)).toBeNull();
        expect(leftWords(3)).toBe("3 left");
        expect(leftWords(0)).toBe("None left");
    });
});
