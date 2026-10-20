import type { BookedRow, BusyRow, CustomerRow, SoldRow } from "./sells";
import {
    bestCustomers,
    bestSellers,
    booked,
    busiest,
    countChange,
    MIN_BOOKINGS,
    partOf,
} from "./sells";

const sold = (
    productId: string,
    window: SoldRow["window"],
    units: number,
    amount: string | null,
): SoldRow => ({
    productId,
    name: productId,
    window,
    sold: units,
    amount: amount === null ? null : { toString: () => amount },
});

describe("bestSellers", () => {
    it("ranks by units, then money, then name, and keeps the top five", () => {
        const rows = [
            sold("a", "PERIOD", 3, "300"),
            sold("b", "PERIOD", 3, "500"),
            sold("c", "PERIOD", 9, "90"),
            sold("d", "PERIOD", 1, "10"),
            sold("e", "PERIOD", 1, "10"),
            sold("f", "PERIOD", 1, "10"),
        ];
        const out = bestSellers(rows, { thin: false, money: true });
        expect(out.total).toBe(6);
        expect(out.rows.map((r) => r.productId)).toEqual([
            "c",
            "b",
            "a",
            "d",
            "e",
        ]);
    });

    it("marks New only when nothing sold before, and compares units", () => {
        const out = bestSellers(
            [
                sold("new", "PERIOD", 2, "20"),
                sold("old", "PERIOD", 12, "120"),
                sold("old", "BEFORE", 10, "100"),
            ],
            { thin: false, money: true },
        );
        const [old, fresh] = out.rows;
        expect(old).toMatchObject({
            soldBefore: 10,
            beforeMinor: 10_000,
            change: { kind: "UP", percent: 20 },
            isNew: false,
        });
        expect(fresh).toMatchObject({ isNew: true, change: { kind: "THIN" } });
    });

    it("leaves out what sold only before, or was all refunded", () => {
        const out = bestSellers(
            [sold("gone", "BEFORE", 4, "40"), sold("back", "PERIOD", 0, "0")],
            { thin: false, money: true },
        );
        expect(out).toEqual({ rows: [], total: 0 });
    });

    it("says nothing is new and nothing compares for a young business", () => {
        const [row] = bestSellers([sold("a", "PERIOD", 5, "50")], {
            thin: true,
            money: true,
        }).rows;
        expect(row).toMatchObject({ isNew: false, change: { kind: "THIN" } });
    });

    it("gives no amounts without payments, and 0 for none in the currency", () => {
        const [hidden] = bestSellers([sold("a", "PERIOD", 5, "50")], {
            thin: false,
            money: false,
        }).rows;
        expect(hidden.amountMinor).toBeNull();
        expect(hidden.beforeMinor).toBeNull();
        const [dollars] = bestSellers([sold("a", "PERIOD", 5, null)], {
            thin: false,
            money: true,
        }).rows;
        expect(dollars.amountMinor).toBe(0);
    });
});

const service = (
    serviceId: string,
    capacity: number,
    window: BookedRow["window"],
    bookings: number,
    sessions: number,
): BookedRow => ({
    serviceId,
    name: serviceId,
    capacity,
    window,
    bookings,
    people: bookings,
    sessions,
});

describe("booked", () => {
    it("gives a class its fill and a one-to-one none", () => {
        const out = booked(
            [
                service("yoga", 10, "PERIOD", 18, 2),
                service("massage", 1, "PERIOD", 4, 4),
            ],
            { thin: false },
        );
        expect(out.rows[0]).toMatchObject({
            kind: "CLASS",
            sessions: 2,
            seats: 20,
            fullPercent: 90,
        });
        expect(out.rows[1]).toMatchObject({
            kind: "ONE_TO_ONE",
            sessions: null,
            seats: null,
            fullPercent: null,
        });
        expect(out.bookings).toBe(22);
        expect(out.enough).toBe(true);
    });

    it("counts a class session everyone cancelled as places offered", () => {
        const [row] = booked([service("yoga", 4, "PERIOD", 0, 1)], {
            thin: false,
        }).rows;
        expect(row).toMatchObject({ bookings: 0, seats: 4, fullPercent: 0 });
    });

    it("says too few below the minimum", () => {
        const out = booked(
            [
                service(
                    "massage",
                    1,
                    "PERIOD",
                    MIN_BOOKINGS - 1,
                    MIN_BOOKINGS - 1,
                ),
            ],
            { thin: false },
        );
        expect(out.enough).toBe(false);
    });

    it("leaves out a service booked only before", () => {
        expect(
            booked([service("massage", 1, "BEFORE", 9, 9)], { thin: false })
                .rows,
        ).toEqual([]);
    });
});

describe("busiest", () => {
    const row = (
        dow: number,
        hour: number,
        kind: BusyRow["kind"],
        count: number,
    ): BusyRow => ({ dow, hour, kind, count });

    it("puts each hour in its part of the day", () => {
        expect([6, 7, 9, 10, 12, 13, 15, 16, 19, 20].map(partOf)).toEqual([
            -1, 0, 0, 1, 1, 2, 2, 3, 3, -1,
        ]);
    });

    it("finds the busiest and quietest cells, the earlier on a tie", () => {
        const out = busiest(
            [
                row(6, 8, "ORDER", 4),
                row(6, 9, "BOOKING", 3),
                row(1, 11, "ORDER", 7),
                row(2, 22, "ORDER", 2),
            ],
            { ageDays: 30 },
        );
        expect(out.busiest).toMatchObject({ dow: 1, part: 1, total: 7 });
        expect(
            out.cells.find((c) => c.dow === 6 && c.part === 0),
        ).toMatchObject({ orders: 4, bookings: 3, total: 7 });
        expect(out.quietest).toMatchObject({ dow: 1, part: 0, total: 0 });
        expect(out.outside).toBe(2);
        expect(out.total).toBe(14);
        expect(out.enough).toBe(true);
    });

    it("needs two weeks and enough sales before it says", () => {
        expect(busiest([row(1, 8, "ORDER", 50)], { ageDays: 10 }).enough).toBe(
            false,
        );
        expect(busiest([row(1, 8, "ORDER", 3)], { ageDays: 60 }).enough).toBe(
            false,
        );
        expect(busiest([], { ageDays: 60 })).toMatchObject({
            busiest: null,
            quietest: null,
        });
    });
});

describe("bestCustomers", () => {
    const person = (over: Partial<CustomerRow> = {}): CustomerRow => ({
        contactId: "c1",
        firstName: null,
        lastName: null,
        email: "asha@example.com",
        company: null,
        amount: { toString: () => "1234.50" },
        orders: 1,
        deliveries: 0,
        bills: 0,
        classes: 0,
        bookings: 0,
        online: false,
        inStore: true,
        total: 7,
        cameBack: 3,
        ...over,
    });

    it("names a person, then their company, then their email", () => {
        const out = bestCustomers(
            [
                person({ firstName: "Asha", lastName: " Rao " }),
                person({ contactId: "c2", company: "Café Bloom" }),
                person({ contactId: "c3" }),
            ],
            new Map([["c1", "Sourdough loaf"]]),
            { money: true, names: true },
        );
        expect(out.rows.map((r) => r.name)).toEqual([
            "Asha Rao",
            "Café Bloom",
            "asha@example.com",
        ]);
        expect(out.rows[0]).toMatchObject({
            amountMinor: 123_450,
            buysMost: "Sourdough loaf",
        });
        expect(out).toMatchObject({ total: 7, cameBack: 3, firstTime: 4 });
    });

    it("never shows a placeholder email", () => {
        const [row] = bestCustomers(
            [person({ email: "removed+x@removed.invalid" })],
            new Map(),
            { money: true, names: true },
        ).rows;
        expect(row.name).toBeNull();
    });

    it("hides names and money by role", () => {
        const [row] = bestCustomers(
            [person({ firstName: "Asha", company: "Café Bloom" })],
            new Map(),
            { money: false, names: false },
        ).rows;
        expect(row).toMatchObject({
            contactId: null,
            name: null,
            company: null,
            amountMinor: null,
        });
    });

    it("is empty with nobody", () => {
        expect(
            bestCustomers([], new Map(), { money: true, names: true }),
        ).toEqual({ rows: [], total: 0, cameBack: 0, firstTime: 0 });
    });
});

describe("countChange", () => {
    it("is THIN for a young business, else the takings rule on units", () => {
        expect(countChange(10, 8, true)).toEqual({ kind: "THIN" });
        expect(countChange(10, 8, false)).toEqual({ kind: "UP", percent: 25 });
        expect(countChange(6, 8, false)).toEqual({ kind: "DOWN", percent: 25 });
        expect(countChange(8, 8, false)).toEqual({ kind: "LEVEL", percent: 0 });
        expect(countChange(8, 2, false)).toEqual({ kind: "THIN" });
    });
});
