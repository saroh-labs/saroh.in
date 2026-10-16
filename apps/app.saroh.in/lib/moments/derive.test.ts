import { describe, expect, it } from "vitest";

import type { HomeModel } from "@/lib/home/service";
import type { OrderListPage, OrderRow } from "@/lib/orders/business-service";
import type { BookingWithService } from "@/lib/services/service";

import {
    firstBookingMoment,
    homeMayHaveFirstBooking,
    homeMayHaveFirstOrder,
    MOMENT_FRESH_MS,
    orderFact,
    ordersMoment,
    unseen,
} from "./derive";
import { MOMENT_KEYS } from "./keys";

const NOW = new Date("2026-10-10T10:00:00.000Z");
const AN_HOUR_AGO = "2026-10-10T09:00:00.000Z";

const row = (over: Partial<OrderRow> = {}): OrderRow =>
    ({
        id: "o1",
        orderId: "1001",
        placedAt: AN_HOUR_AGO,
        store: { id: "s1", name: "Hill Road" },
        customer: { id: "c1", name: "Asha Rao" },
        currency: "INR",
        total: "1240.00",
        ...over,
    }) as OrderRow;

const page = (
    all: number,
    rows: OrderRow[] = [row()],
): Pick<OrderListPage, "rows" | "counts"> => ({
    rows,
    counts: { all, open: all, refunded: 0 },
});

const OPEN = { plain: true, reads: true, now: NOW };

describe("the first order", () => {
    it("is said for the only order, with who and how much", () => {
        expect(ordersMoment(page(1), OPEN)).toEqual({
            key: "first-order",
            title: "Your first order",
            fact: "Asha Rao, ₹1,240.",
            action: {
                label: "Open order",
                href: "/commerce/orders/o1?storefront=s1",
            },
        });
    });

    it("is not said for the second order, or with none", () => {
        expect(ordersMoment(page(2, [row(), row()]), OPEN)).toBeNull();
        expect(ordersMoment(page(0, []), OPEN)).toBeNull();
    });

    it("is not said to a role that cannot open the order with its money", () => {
        expect(ordersMoment(page(1), { ...OPEN, reads: false })).toBeNull();
    });

    it("is not said on a narrowed list, where the count means something else", () => {
        expect(ordersMoment(page(1), { ...OPEN, plain: false })).toBeNull();
    });

    it("is over after a week, seen or not", () => {
        const old = new Date(
            NOW.getTime() - MOMENT_FRESH_MS - 60_000,
        ).toISOString();
        expect(
            ordersMoment(page(1, [row({ placedAt: old })]), OPEN),
        ).toBeNull();
    });

    it("names a walk-in by the name they gave", () => {
        const walkIn = row({
            customer: null,
            walkIn: { name: "Farah", phone: null },
        });
        expect(ordersMoment(page(1, [walkIn]), OPEN)?.fact).toBe(
            "Farah, ₹1,240.",
        );
    });

    it("says only what it knows, and nothing when it knows neither", () => {
        expect(orderFact(row({ customer: null }))).toBe("₹1,240.");
        expect(orderFact(row({ total: undefined }))).toBe("Asha Rao.");
        expect(orderFact(row({ customer: null, total: undefined }))).toBeNull();
        expect(
            ordersMoment(
                page(1, [row({ customer: null, total: undefined })]),
                OPEN,
            ),
        ).toBeNull();
    });
});

describe("the 10th and 100th order", () => {
    it("are said at exactly ten and a hundred, about the newest order", () => {
        expect(ordersMoment(page(10), OPEN)).toMatchObject({
            key: "orders-10",
            title: "Your 10th order",
            fact: "Asha Rao, ₹1,240.",
        });
        expect(ordersMoment(page(100), OPEN)).toMatchObject({
            key: "orders-100",
            title: "Your 100th order",
        });
    });

    it("are not said one either side", () => {
        for (const all of [9, 11, 99, 101, 1000]) {
            expect(ordersMoment(page(all), OPEN), String(all)).toBeNull();
        }
    });
});

const booking = (
    over: Partial<BookingWithService> = {},
): BookingWithService => ({
    id: "b1",
    serviceId: "sv1",
    startAt: "2026-10-12T04:00:00.000Z",
    endAt: "2026-10-12T04:30:00.000Z",
    timezone: "Asia/Kolkata",
    status: "CONFIRMED",
    outcome: null,
    bookerName: "asha",
    bookerEmail: "asha.rao@example.com",
    bookerPhone: null,
    createdAt: AN_HOUR_AGO,
    cancelledAt: null,
    contact: {
        id: "c1",
        firstName: "Asha",
        lastName: "Rao",
        email: "asha.rao@example.com",
    },
    service: { id: "sv1", name: "Haircut", timezone: "Asia/Kolkata" },
    ...over,
});

const READS = { reads: true, now: NOW };

describe("the first booking", () => {
    it("is said for the only booking: who, what and when on the 12-hour clock", () => {
        const moment = firstBookingMoment([booking()], READS);
        expect(moment).toMatchObject({
            key: "first-booking",
            title: "Your first booking",
            action: { label: "Open booking", href: "/bookings/b1" },
        });
        expect(moment?.fact).toBe("Asha Rao · Haircut · Mon 12 Oct, 9:30 am.");
    });

    it("is not said for the second booking, or with none", () => {
        expect(
            firstBookingMoment([booking(), booking({ id: "b2" })], READS),
        ).toBeNull();
        expect(firstBookingMoment([], READS)).toBeNull();
    });

    it("is not said to a role that cannot open the booking", () => {
        expect(
            firstBookingMoment([booking()], { ...READS, reads: false }),
        ).toBeNull();
    });

    it("is not said for a hold still waiting, or a booking since cancelled", () => {
        for (const status of ["PENDING", "CANCELLED"] as const) {
            expect(
                firstBookingMoment([booking({ status })], READS),
                status,
            ).toBeNull();
        }
    });

    it("falls back to the name they typed, and says today as Today", () => {
        const moment = firstBookingMoment(
            [
                booking({
                    contact: null,
                    bookerName: "Farah Khan",
                    startAt: "2026-10-10T11:30:00.000Z",
                    endAt: "2026-10-10T12:00:00.000Z",
                }),
            ],
            READS,
        );
        expect(moment?.fact).toBe("Farah Khan · Haircut · Today, 5:00 pm.");
    });

    it("is over after a week", () => {
        const old = new Date(
            NOW.getTime() - MOMENT_FRESH_MS - 60_000,
        ).toISOString();
        expect(
            firstBookingMoment([booking({ createdAt: old })], READS),
        ).toBeNull();
    });
});

const home = (over: Partial<HomeModel> = {}): HomeModel => ({
    view: "business",
    staff: null,
    actions: [],
    hasAnyModule: true,
    upcoming: [],
    unavailable: [],
    needs: [],
    needsTotal: 0,
    ordersInProgress: 0,
    today: null,
    lastDay: {
        zone: "Asia/Kolkata",
        date: "2026-10-10",
        partOfDay: "morning",
        since: "2026-10-09T10:00:00.000Z",
        fresh: false,
        items: [],
    },
    week: null,
    ...over,
});

const since = (kind: "ORDERS" | "BOOKINGS", count: number) => ({
    kind,
    count,
    amountMinor: null,
    currency: null,
    href: "/",
});

const withItems = (
    items: ReturnType<typeof since>[],
    over: Partial<HomeModel> = {},
) => {
    const base = home(over);
    return { ...base, lastDay: base.lastDay && { ...base.lastDay, items } };
};

describe("when Home asks", () => {
    it("asks about a first order only with exactly one new order in the last day", () => {
        expect(homeMayHaveFirstOrder(withItems([since("ORDERS", 1)]))).toBe(
            true,
        );
        expect(homeMayHaveFirstOrder(withItems([since("ORDERS", 2)]))).toBe(
            false,
        );
        expect(homeMayHaveFirstOrder(withItems([]))).toBe(false);
        expect(homeMayHaveFirstOrder(home({ lastDay: null }))).toBe(false);
    });

    it("never asks for a shop with more than one order this week", () => {
        const week = (count: number) =>
            ({
                zone: "Asia/Kolkata",
                startDate: "2026-10-05",
                orders: { count, href: "/" },
            }) as HomeModel["week"];
        expect(
            homeMayHaveFirstOrder(
                withItems([since("ORDERS", 1)], { week: week(1) }),
            ),
        ).toBe(true);
        expect(
            homeMayHaveFirstOrder(
                withItems([since("ORDERS", 1)], { week: week(6) }),
            ),
        ).toBe(false);
    });

    it("asks about a first booking with one new booking and at most one to come", () => {
        const one = [since("BOOKINGS", 1)];
        expect(homeMayHaveFirstBooking(withItems(one))).toBe(true);
        expect(
            homeMayHaveFirstBooking(
                withItems(one, {
                    upcoming: [{}, {}] as HomeModel["upcoming"],
                }),
            ),
        ).toBe(false);
        expect(homeMayHaveFirstBooking(withItems([since("ORDERS", 1)]))).toBe(
            false,
        );
    });

    it("never asks on a staff member's or a reviewer's Home", () => {
        for (const view of ["staff", "reviewer"] as const) {
            const theirs = withItems(
                [since("ORDERS", 1), since("BOOKINGS", 1)],
                { view },
            );
            expect(homeMayHaveFirstOrder(theirs)).toBe(false);
            expect(homeMayHaveFirstBooking(theirs)).toBe(false);
        }
    });
});

describe("shown once", () => {
    const moment = ordersMoment(page(1), OPEN);

    it("is shown while the business hasn't seen it", () => {
        expect(unseen(moment, new Set())).toBe(moment);
        expect(unseen(moment, new Set(["first-booking"] as const))).toBe(
            moment,
        );
    });

    it("is not shown once anyone has put it away", () => {
        expect(unseen(moment, new Set(["first-order"] as const))).toBeNull();
    });

    it("is not shown when what was seen can't be read", () => {
        expect(unseen(moment, null)).toBeNull();
    });

    it("keeps the list the API keeps", () => {
        expect([...MOMENT_KEYS]).toEqual([
            "first-order",
            "first-booking",
            "orders-10",
            "orders-100",
        ]);
    });
});
