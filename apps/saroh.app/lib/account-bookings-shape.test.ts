import { describe, expect, it } from "vitest";

import {
    bookingsResult,
    cancelResult,
    isBookingRow,
    timesResult,
} from "./account-bookings-shape";

/**
 * The account's Bookings answers on the site's server (round-2 plan A, A6):
 * read field by field, and anything else is treated as a failed read —
 * never drawn, never read as "nothing booked".
 */

const ROW = {
    ref: "bk_1",
    service: "Check-up",
    serviceRef: "svc_1",
    startAt: "2026-10-05T04:30:00.000Z",
    endAt: "2026-10-05T05:30:00.000Z",
    timezone: "Asia/Kolkata",
    staff: "Dr. Rao",
    online: false,
    state: "booked",
    kind: "one",
    visit: { number: 2, of: 3 },
    cancelledLate: false,
    move: "sheet",
    cancel: {
        late: false,
        freeUntil: "2026-10-04T04:30:00.000Z",
        money: "refund",
        credit: null,
    },
};

const TREATMENT = {
    ref: "ord_1",
    name: "Root canal",
    total: "9000.00",
    currency: "INR",
    paid: true,
    done: 1,
    bookNext: 2,
    visits: [
        {
            number: 1,
            ref: "bk_v1",
            startAt: "2026-09-20T04:30:00.000Z",
            timezone: "Asia/Kolkata",
            staff: "Dr. Mehta",
            online: false,
            state: "done",
        },
        {
            number: 2,
            ref: null,
            startAt: null,
            timezone: null,
            staff: null,
            online: null,
            state: "to-book",
        },
    ],
};

describe("the Bookings answers (A6)", () => {
    it("reads the lists and a treatment", () => {
        const body = {
            comingUp: [ROW],
            past: [{ ...ROW, state: "attended", move: null, cancel: null }],
            cancelled: [
                {
                    ...ROW,
                    state: "cancelled",
                    cancelledLate: true,
                    move: null,
                    cancel: null,
                    visit: null,
                },
            ],
            treatments: [TREATMENT],
        };
        expect(bookingsResult(body)).toEqual(body);
    });

    it("refuses a row in a shape it doesn't know", () => {
        expect(isBookingRow({ ...ROW, move: "teleport" })).toBe(false);
        expect(isBookingRow({ ...ROW, state: "PENDING" })).toBe(false);
        expect(
            isBookingRow({ ...ROW, cancel: { ...ROW.cancel, money: "some" } }),
        ).toBe(false);
        expect(isBookingRow({ ...ROW, visit: { number: "2" } })).toBe(false);
        expect(
            bookingsResult({
                comingUp: [ROW],
                past: [],
                cancelled: [],
                treatments: [{ ...TREATMENT, bookNext: "2" }],
            }),
        ).toBeNull();
        expect(bookingsResult(null)).toBeNull();
    });

    it("reads free times, and what a cancel did", () => {
        expect(
            timesResult({
                service: "Check-up",
                staff: null,
                timezone: "UTC",
                times: ["2026-10-06T05:30:00.000Z"],
            }),
        ).not.toBeNull();
        expect(
            timesResult({ service: "Check-up", timezone: "UTC", times: [1] }),
        ).toBeNull();
        const cancelled = {
            booking: { ...ROW, state: "cancelled" },
            refund: { amount: "400.00", currency: "INR", status: "CONFIRMING" },
            kept: null,
            order: false,
        };
        expect(cancelResult(cancelled)).toEqual(cancelled);
        expect(
            cancelResult({
                ...cancelled,
                refund: { ...cancelled.refund, status: "DONE" },
            }),
        ).toBeNull();
        // Whether the team was told (A14): a boolean, or absent before A14.
        expect(cancelResult({ ...cancelled, told: true })).toEqual({
            ...cancelled,
            told: true,
        });
        expect(cancelResult({ ...cancelled, told: "yes" })).toBeNull();
    });
});
