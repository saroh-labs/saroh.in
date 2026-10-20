import { describe, expect, it } from "vitest";

import {
    bookedView,
    busyLevel,
    busyView,
    changeView,
    customersView,
    hiddenLine,
    oftenWords,
    partsShown,
    soldView,
} from "./sells-words";
import {
    busiest,
    sellsEmpty,
    sellsRead,
    sellsWithoutMoney,
    sellsWithoutNames,
} from "./sells.fixture";

/**
 * The What sells tab's words (DEC-171, plan U13, #1095): each answer from
 * the rows under it; thin data said, not hidden; money and names only for
 * the roles that may read them.
 */

describe("What sells most?", () => {
    it("names the leader and the fastest grower, each row with its change (IBSellsD)", () => {
        const view = soldView(sellsRead());
        expect(view.answer).toBe(
            "Sourdough loaf sells most: 412 sold. Seeded multigrain loaf grew fastest, up 21%.",
        );
        expect(view.showAmount).toBe(true);
        expect(view.showChange).toBe(true);
        expect(view.changeHead).toBe("Against the 4 weeks before");
        expect(view.rows.map((r) => [r.name, r.sold, r.amount])).toEqual([
            ["Sourdough loaf", "412", "₹74,160"],
            ["Seeded multigrain loaf", "236", "₹47,200"],
            ["Croissants, box of 4", "188", "₹33,840"],
            ["Rye starter kit", "41", "₹16,400"],
            ["Cinnamon buns", "150", "₹13,500"],
        ]);
        expect(view.rows.map((r) => r.change.text)).toEqual([
            "8%",
            "21%",
            "6%",
            "New",
            "3%",
        ]);
        expect(view.rows[2].change).toMatchObject({
            kind: "down",
            says: "Down 6% on the 4 weeks before",
        });
        expect(view.rows[0].href).toBe("/commerce/products/p1");
        expect(view.seeAll).toEqual({
            href: "/commerce/products",
            label: "See all 14 products",
        });
    });

    it("says a change of 2% or less is about the same, and a big one in times", () => {
        expect(changeView({ kind: "UP", percent: 2 }, false, "7d")).toEqual({
            kind: "same",
            text: "About the same",
            says: "About the same as the 7 days before",
        });
        expect(
            changeView({ kind: "LEVEL", percent: 0 }, false, "4w").kind,
        ).toBe("same");
        expect(changeView({ kind: "UP", percent: 210 }, false, "4w")).toEqual({
            kind: "up",
            text: "About 3 times",
            says: "About 3 times as many as the 4 weeks before",
        });
        // Something sold, so it never fell 100%.
        expect(
            changeView({ kind: "DOWN", percent: 100 }, false, "4w").text,
        ).toBe("99%");
        expect(changeView({ kind: "THIN" }, false, "4w").kind).toBe("none");
        expect(changeView(undefined, false, "4w").kind).toBe("none");
        expect(changeView({ kind: "UP", percent: 100 }, true, "3m")).toEqual({
            kind: "new",
            text: "New",
            says: "New: none sold in the 3 months before",
        });
    });

    it("names only the leader when it also grew most, and says New", () => {
        const read = sellsRead();
        const rows = read.bestSellers.rows.map((r, i) =>
            i === 0
                ? { ...r, change: { kind: "UP" as const, percent: 40 } }
                : r,
        );
        expect(
            soldView({ ...read, bestSellers: { rows, total: 5 } }).answer,
        ).toBe("Sourdough loaf sells most: 412 sold.");
        const fresh = [{ ...rows[0], isNew: true }];
        expect(
            soldView({ ...read, bestSellers: { rows: fresh, total: 1 } }),
        ).toMatchObject({
            answer: "Sourdough loaf sells most: 412 sold, and it's new.",
            seeAll: { label: "See all products" },
        });
    });

    it("in the first weeks names the leader and compares nothing (IBThinD)", () => {
        const view = soldView(sellsRead({ thin: true }));
        expect(view.answer).toBe(
            "Sourdough loaf leads with 412 sold. There's nothing earlier to compare with yet.",
        );
        expect(view.showChange).toBe(false);
    });

    it("without payments counts units and never shows money (IBMemberD)", () => {
        const view = soldView(sellsWithoutMoney());
        expect(view.showAmount).toBe(false);
        expect(view.rows.every((r) => r.amount === null)).toBe(true);
        expect(view.answer).not.toMatch(/₹/);
    });

    it("says nothing sold, with no See all (IBSellsEmptyD)", () => {
        const view = soldView(sellsEmpty({ period: "7d" }));
        expect(view.answer).toBe(
            "Nothing sold in the last 7 days. Best sellers show here once something sells.",
        );
        expect(view.rows).toEqual([]);
        expect(view.seeAll).toBeNull();
    });
});

describe("What do people book?", () => {
    it("says how full each class was, and a one-to-one's bookings without a fill", () => {
        const view = bookedView(sellsRead());
        expect(view.answer).toBe(
            "Sourdough basics class: 46 people, and it is nearly always full.",
        );
        expect(view.rows).toEqual([
            {
                key: "s1",
                name: "Sourdough basics class",
                line: "46 people in 8 classes",
                fullPercent: 96,
                fullText: "96% full",
            },
            {
                key: "s2",
                name: "Croissant class",
                line: "31 bookings in 6 classes, from 28 people",
                fullPercent: 86,
                fullText: "86% full",
            },
            {
                key: "s3",
                name: "Cake tasting",
                line: "12 bookings",
                fullPercent: null,
                fullText: null,
            },
        ]);
        expect(view.seeAll).toEqual({
            href: "/services",
            label: "See services",
        });
    });

    it("names the most booked when no class is nearly full, and a service by its bookings", () => {
        const read = sellsRead();
        const [a, , c] = read.booked.rows;
        expect(
            bookedView({
                ...read,
                booked: {
                    ...read.booked,
                    rows: [{ ...a, fullPercent: 72 }],
                },
            }).answer,
        ).toBe("Sourdough basics class is booked most: 46 people, 72% full.");
        expect(
            bookedView({ ...read, booked: { ...read.booked, rows: [c] } })
                .answer,
        ).toBe("Cake tasting is booked most: 12 bookings.");
    });

    it("says too few bookings yet, and still lists them (IBThinD)", () => {
        const read = sellsRead();
        const view = bookedView({
            ...read,
            booked: { ...read.booked, bookings: 3, enough: false },
        });
        expect(view.answer).toBe(
            "Too few bookings yet to say which class is busiest.",
        );
        expect(view.rows).toHaveLength(3);
        const service = bookedView({
            ...read,
            booked: {
                rows: [read.booked.rows[2]],
                total: 1,
                bookings: 2,
                enough: false,
            },
        });
        expect(service.answer).toBe(
            "Too few bookings yet to say which service is booked most.",
        );
    });

    it("says no bookings, on its own (IBSellsEmptyD)", () => {
        const view = bookedView(sellsEmpty());
        expect(view).toMatchObject({
            answer: "No bookings in the last 4 weeks. Your classes and services show here with how full they were.",
            empty: true,
            rows: [],
            seeAll: null,
        });
    });
});

describe("When is it busiest?", () => {
    it("names the busiest and the quietest, with five steps of busy (IBSellsD)", () => {
        const view = busyView(sellsRead());
        expect(view.answer).toBe(
            "Saturday mornings are busiest: 1 in 7 sales and bookings happen then. Wednesday afternoons are the quietest.",
        );
        expect(view.enough).toBe(true);
        expect(view.rows).toHaveLength(4);
        expect(view.rows.every((r) => r.length === 7)).toBe(true);
        expect(view.rows[0][5]).toMatchObject({
            level: 5,
            total: 120,
            label: "Saturday 7 to 10: 90 orders and 30 bookings",
        });
        expect(view.rows[2][2]).toMatchObject({ level: 1, total: 4 });
        expect(view.outside).toBeNull();
    });

    it("steps from quieter to busier, nothing at 0", () => {
        expect(busyLevel(0, 100)).toBe(0);
        expect(busyLevel(1, 100)).toBe(1);
        expect(busyLevel(41, 100)).toBe(3);
        expect(busyLevel(100, 100)).toBe(5);
        expect(busyLevel(5, 0)).toBe(0);
    });

    it("says more than half, a time with none, and what falls outside the grid", () => {
        const grid = [
            [30, 1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1, 0],
        ];
        const view = busyView(
            sellsRead({ busiest: busiest(grid, { outside: 12 }) }),
        );
        expect(view.answer).toBe(
            "Monday mornings are busiest: more than half sales and bookings happen then. Sunday evenings had none.",
        );
        expect(view.outside).toBe(
            "12 sales and bookings before 7 or after 8 aren't shown.",
        );
        expect(view.rows[3][6].label).toBe("Sunday 4 to 8: nothing");
    });

    it("needs two weeks, and enough to say (IBSellsEmptyD)", () => {
        expect(busyView(sellsRead({ ageDays: 9 }))).toMatchObject({
            answer: "Busiest days and times need about 2 weeks of sales or bookings.",
            enough: false,
        });
        expect(busyView(sellsEmpty())).toMatchObject({
            answer: "Too few sales and bookings in the last 4 weeks to say when it's busiest.",
            enough: false,
        });
        // An older API that sends no busiest.
        expect(busyView(sellsRead({ busiest: undefined })).enough).toBe(false);
    });
});

describe("Who are my best customers?", () => {
    it("says who came back, names who brought in most, and each one's figures (IBSellsD)", () => {
        const view = customersView(sellsRead());
        expect(view.answer).toBe(
            "18 customers came back and 9 came for the first time in the last 4 weeks. Shruti Menon brought in the most, ₹22,500.",
        );
        expect(
            view.rows.map((r) => [r.name, r.sub, r.amount, r.often, r.href]),
        ).toEqual([
            [
                "Shruti Menon",
                "Café Bloom · Sourdough loaf",
                "₹22,500",
                "4 orders",
                "/contacts/c1",
            ],
            [
                "Arjun Mehta",
                "Sourdough loaf",
                "₹7,200",
                "4 deliveries",
                "/contacts/c2",
            ],
            [
                "Kavya Iyer",
                "Sourdough basics class",
                "₹5,400",
                "3 classes",
                "/contacts/c3",
            ],
            [
                "Neha Joshi",
                "Shop and online",
                "₹4,860",
                "9 orders",
                "/contacts/c4",
            ],
        ]);
        expect(view.seeAll).toEqual({
            href: "/commerce/customers?sort=spent",
            label: "See all customers",
        });
    });

    it("without payments ranks by how often, and shows no money (IBMemberD)", () => {
        const view = customersView(sellsWithoutMoney());
        expect(view.answer).toBe(
            "18 customers came back and 9 came for the first time in the last 4 weeks. Shruti Menon came most often.",
        );
        expect(view.rows.every((r) => r.amount === null)).toBe(true);
        expect(view.seeAll?.href).toBe("/commerce/customers");
    });

    it("without customers' names names nobody, links nowhere, and keeps the counts", () => {
        const view = customersView(sellsWithoutNames());
        expect(view.answer).toBe(
            "18 customers came back and 9 came for the first time in the last 4 weeks.",
        );
        expect(view.rows.every((r) => r.name === null && r.href === null)).toBe(
            true,
        );
        expect(view.rows[0]).toMatchObject({
            amount: "₹22,500",
            often: "4 orders",
        });
        expect(view.seeAll).toBeNull();
    });

    it("says all came back, or all were new, and one customer as one", () => {
        const read = sellsRead();
        const c = read.customers;
        if (!c) throw new Error("The fixture has customers");
        expect(
            customersView({
                ...read,
                customers: { ...c, total: 4, cameBack: 4, firstTime: 0 },
            }).answer,
        ).toMatch(/^All 4 customers in the last 4 weeks had come before\./);
        expect(
            customersView({
                ...read,
                customers: { ...c, total: 1, cameBack: 0, firstTime: 1 },
            }).answer,
        ).toMatch(
            /^Your one customer in the last 4 weeks came for the first time\./,
        );
    });

    it("says nobody paid or booked (IBSellsEmptyD)", () => {
        expect(customersView(sellsEmpty())).toMatchObject({
            answer: "Nobody paid or booked in the last 4 weeks. Your best customers show here once people buy or book.",
            empty: true,
        });
        expect(customersView(sellsRead({ customers: undefined })).empty).toBe(
            true,
        );
    });

    it("counts what each did most, or nothing", () => {
        const base = sellsRead().customers?.rows[0];
        if (!base) throw new Error("The fixture has customers");
        expect(oftenWords({ ...base, orders: 0, bills: 2, bookings: 1 })).toBe(
            "2 bills",
        );
        expect(oftenWords({ ...base, orders: 1, deliveries: 1 })).toBe(
            "1 delivery",
        );
        expect(oftenWords({ ...base, orders: 0 })).toBeNull();
    });
});

describe("the tab", () => {
    it("says once what this role doesn't see", () => {
        expect(hiddenLine(sellsRead())).toBeNull();
        expect(hiddenLine(sellsWithoutMoney())).toBe(
            "Counts only: money is shown to people who can see payments.",
        );
        expect(hiddenLine(sellsWithoutNames())).toBe(
            "Customers' names are shown to people who can see customers.",
        );
        expect(hiddenLine(sellsWithoutMoney({ names: false }))).toMatch(
            /^Counts only: money .* and customers' names/,
        );
    });

    it("shows only the parts a business has, and what it did either way", () => {
        const read = sellsEmpty();
        expect(partsShown(read, null)).toEqual({ sells: true, books: true });
        expect(partsShown(read, { sells: true, books: false })).toEqual({
            sells: true,
            books: false,
        });
        expect(partsShown(read, { sells: false, books: true })).toEqual({
            sells: false,
            books: true,
        });
        // Bookings taken before Bookings was turned off still show.
        expect(partsShown(sellsRead(), { sells: true, books: false })).toEqual({
            sells: true,
            books: true,
        });
        expect(partsShown(read, { sells: false, books: false })).toEqual({
            sells: true,
            books: false,
        });
    });
});
