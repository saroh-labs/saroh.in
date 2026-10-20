import type { InsightsPeriod } from "./period";
import { periodWindow } from "./period";
import type { BusiestRead, BusyCellRead, SellsRead } from "./reads";

/**
 * A What sells read as the API sends it (`GET analytics/sells`, #1080),
 * for Rye & Co. on Monday 19 Oct 2026, the last 4 weeks, as the owner
 * reads it (`IBSellsD`). For the words' and the tab's tests.
 */

/**
 * The week's 28 cells, from a grid of totals: a row per part of the day,
 * Monday first. Each total is split as orders, with a booking in every
 * fourth.
 */
export function busyCells(
    grid: readonly (readonly number[])[],
): BusyCellRead[] {
    const cells: BusyCellRead[] = [];
    for (let dow = 1; dow <= 7; dow += 1) {
        for (let part = 0; part < 4; part += 1) {
            const total = grid[part]?.[dow - 1] ?? 0;
            const bookings = Math.floor(total / 4);
            cells.push({
                dow,
                part,
                orders: total - bookings,
                bookings,
                total,
            });
        }
    }
    return cells;
}

/** The busiest read the API would fold from `grid`. */
export function busiest(
    grid: readonly (readonly number[])[],
    over: Partial<BusiestRead> = {},
): BusiestRead {
    const cells = busyCells(grid);
    const total = cells.reduce((s, c) => s + c.total, 0);
    let most: BusyCellRead | null = null;
    let least: BusyCellRead | null = null;
    if (total > 0) {
        for (const c of cells) {
            if (!most || c.total > most.total) most = c;
            if (!least || c.total < least.total) least = c;
        }
    }
    return {
        cells,
        busiest: most,
        quietest: least,
        total,
        outside: 0,
        enough: total >= 10,
        ...over,
    };
}

/** Rye's weeks: Saturday mornings busiest, Wednesday afternoons quietest. */
export const RYE_GRID = [
    [20, 20, 20, 20, 30, 120, 60],
    [20, 20, 30, 20, 30, 80, 30],
    [10, 10, 4, 10, 20, 30, 10],
    [20, 20, 20, 30, 60, 20, 10],
] as const;

export function sellsRead(
    over: Partial<SellsRead> = {},
    period: InsightsPeriod = "4w",
): SellsRead {
    return {
        period,
        zone: "Asia/Kolkata",
        currency: "INR",
        window: periodWindow(period, "2026-10-19"),
        ageDays: 651,
        thin: false,
        money: true,
        names: true,
        bestSellers: {
            rows: [
                {
                    productId: "p1",
                    name: "Sourdough loaf",
                    sold: 412,
                    soldBefore: 381,
                    amountMinor: 7_416_000,
                    change: { kind: "UP", percent: 8 },
                    isNew: false,
                },
                {
                    productId: "p2",
                    name: "Seeded multigrain loaf",
                    sold: 236,
                    soldBefore: 195,
                    amountMinor: 4_720_000,
                    change: { kind: "UP", percent: 21 },
                    isNew: false,
                },
                {
                    productId: "p3",
                    name: "Croissants, box of 4",
                    sold: 188,
                    soldBefore: 200,
                    amountMinor: 3_384_000,
                    change: { kind: "DOWN", percent: 6 },
                    isNew: false,
                },
                {
                    productId: "p4",
                    name: "Rye starter kit",
                    sold: 41,
                    soldBefore: 0,
                    amountMinor: 1_640_000,
                    change: { kind: "UP", percent: 100 },
                    isNew: true,
                },
                {
                    productId: "p5",
                    name: "Cinnamon buns",
                    sold: 150,
                    soldBefore: 146,
                    amountMinor: 1_350_000,
                    change: { kind: "UP", percent: 3 },
                    isNew: false,
                },
            ],
            total: 14,
        },
        booked: {
            rows: [
                {
                    serviceId: "s1",
                    name: "Sourdough basics class",
                    kind: "CLASS",
                    bookings: 46,
                    people: 46,
                    sessions: 8,
                    fullPercent: 96,
                },
                {
                    serviceId: "s2",
                    name: "Croissant class",
                    kind: "CLASS",
                    bookings: 31,
                    people: 28,
                    sessions: 6,
                    fullPercent: 86,
                },
                {
                    serviceId: "s3",
                    name: "Cake tasting",
                    kind: "ONE_TO_ONE",
                    bookings: 12,
                    people: 12,
                    sessions: null,
                    fullPercent: null,
                },
            ],
            total: 3,
            bookings: 89,
            enough: true,
        },
        busiest: busiest(RYE_GRID),
        customers: {
            rows: [
                {
                    contactId: "c1",
                    name: "Shruti Menon",
                    company: "Café Bloom",
                    amountMinor: 2_250_000,
                    orders: 4,
                    deliveries: 0,
                    bills: 0,
                    classes: 0,
                    bookings: 0,
                    online: false,
                    inStore: true,
                    buysMost: "Sourdough loaf",
                },
                {
                    contactId: "c2",
                    name: "Arjun Mehta",
                    company: null,
                    amountMinor: 720_000,
                    orders: 4,
                    deliveries: 4,
                    bills: 0,
                    classes: 0,
                    bookings: 0,
                    online: true,
                    inStore: false,
                    buysMost: "Sourdough loaf",
                },
                {
                    contactId: "c3",
                    name: "Kavya Iyer",
                    company: null,
                    amountMinor: 540_000,
                    orders: 0,
                    deliveries: 0,
                    bills: 0,
                    classes: 3,
                    bookings: 0,
                    online: false,
                    inStore: false,
                    buysMost: "Sourdough basics class",
                },
                {
                    contactId: "c4",
                    name: "Neha Joshi",
                    company: null,
                    amountMinor: 486_000,
                    orders: 9,
                    deliveries: 2,
                    bills: 0,
                    classes: 0,
                    bookings: 0,
                    online: true,
                    inStore: true,
                    buysMost: null,
                },
            ],
            total: 27,
            cameBack: 18,
            firstTime: 9,
        },
        ...over,
    };
}

/** The same read for a role without payments (`IBMemberD`): counts only. */
export function sellsWithoutMoney(over: Partial<SellsRead> = {}): SellsRead {
    const read = sellsRead();
    return {
        ...read,
        currency: null,
        money: false,
        bestSellers: {
            ...read.bestSellers,
            rows: read.bestSellers.rows.map((r) => ({
                ...r,
                amountMinor: null,
            })),
        },
        customers: read.customers && {
            ...read.customers,
            rows: read.customers.rows.map((c) => ({ ...c, amountMinor: null })),
        },
        ...over,
    };
}

/** The same read without customers' names (no `contact:read`). */
export function sellsWithoutNames(over: Partial<SellsRead> = {}): SellsRead {
    const read = sellsRead();
    return {
        ...read,
        names: false,
        customers: read.customers && {
            ...read.customers,
            rows: read.customers.rows.map((c) => ({
                ...c,
                contactId: null,
                name: null,
                company: null,
            })),
        },
        ...over,
    };
}

/** Nothing sold, booked or bought in the period (`IBSellsEmptyD`). */
export function sellsEmpty(over: Partial<SellsRead> = {}): SellsRead {
    return sellsRead({
        bestSellers: { rows: [], total: 0 },
        booked: { rows: [], total: 0, bookings: 0, enough: false },
        busiest: busiest([[], [], [], []], { enough: false }),
        customers: { rows: [], total: 0, cameBack: 0, firstTime: 0 },
        ...over,
    });
}
