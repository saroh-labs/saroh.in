import { describe, expect, it } from "vitest";

import {
    coursesResult,
    dataRequestResult,
    homeDetails,
    invoicesDueResult,
    isChange,
    isCourse,
    isInvoiceDue,
    isWaitlistPlace,
    noticesResult,
    waitlistResult,
} from "./account-details-shape";
import { homeResult } from "./account-shape";

/**
 * The account's newer answers, checked before a page sees them (DEC-142):
 * a shape we don't know is never drawn, a failed block stays failed, and
 * an API from before them draws nothing rather than something wrong.
 */

const INVOICE = {
    ref: "inv_1",
    number: "INV-0042",
    what: "Unlimited, October",
    issuedAt: "2026-10-01T05:00:00.000Z",
    dueAt: "2026-10-08T05:00:00.000Z",
    overdue: true,
    total: "2500.00",
    currency: "INR",
    billOfSupply: false,
    pay: "online",
};

const PLACE = {
    service: "Morning flow",
    serviceRef: "svc_1",
    startAt: "2026-10-14T03:30:00.000Z",
    timezone: "Asia/Kolkata",
    status: "WAITING",
    placeInLine: 2,
    offeredUntil: null,
};

const COURSE = {
    ref: "enr_1",
    name: "Pottery",
    firstAt: "2026-10-05T04:30:00.000Z",
    lastAt: "2026-10-26T04:30:00.000Z",
    timezone: "Asia/Kolkata",
    sessions: 4,
    attended: 1,
    missed: 0,
    left: 3,
    nextAt: "2026-10-19T04:30:00.000Z",
};

const CHANGES = [
    {
        kind: "order",
        ref: "o1",
        number: "1019",
        status: "Ready",
        at: "2026-10-11T09:00:00.000Z",
    },
    {
        kind: "booking-moved",
        ref: "b1",
        service: "Check-up",
        startAt: "2026-10-15T05:00:00.000Z",
        timezone: "Asia/Kolkata",
        at: "2026-10-11T09:00:00.000Z",
    },
    {
        kind: "booking-cancelled",
        ref: "b2",
        service: "Check-up",
        startAt: "2026-10-14T05:00:00.000Z",
        timezone: "Asia/Kolkata",
        at: "2026-10-11T09:00:00.000Z",
    },
    { kind: "messages", count: 2, at: "2026-10-11T09:00:00.000Z" },
    {
        kind: "invoice",
        ref: "inv_1",
        number: "INV-0042",
        total: "2500.00",
        currency: "INR",
        at: "2026-10-11T09:00:00.000Z",
    },
];

describe("an invoice to pay", () => {
    it("is read field by field", () => {
        expect(isInvoiceDue(INVOICE)).toBe(true);
        expect(isInvoiceDue({ ...INVOICE, what: null, dueAt: null })).toBe(
            true,
        );
        expect(invoicesDueResult([INVOICE])).toEqual([INVOICE]);
        expect(invoicesDueResult([])).toEqual([]);
    });

    it("anything else is not one", () => {
        for (const wrong of [
            { ...INVOICE, pay: "later" },
            { ...INVOICE, overdue: "yes" },
            { ...INVOICE, dueAt: "next week" },
            { ...INVOICE, total: 2500 },
            { ...INVOICE, ref: undefined },
            null,
            "INV-0042",
        ]) {
            expect(isInvoiceDue(wrong)).toBe(false);
        }
        expect(invoicesDueResult([INVOICE, { ...INVOICE, pay: "x" }])).toBe(
            null,
        );
        expect(invoicesDueResult({ value: [INVOICE] })).toBe(null);
    });
});

describe("a place in line, a course and the email choice", () => {
    it("are read field by field", () => {
        expect(isWaitlistPlace(PLACE)).toBe(true);
        expect(
            isWaitlistPlace({
                ...PLACE,
                status: "OFFERED",
                placeInLine: null,
                offeredUntil: "2026-10-12T07:30:00.000Z",
            }),
        ).toBe(true);
        expect(waitlistResult([PLACE])).toEqual([PLACE]);
        expect(isCourse(COURSE)).toBe(true);
        expect(isCourse({ ...COURSE, firstAt: null, lastAt: null })).toBe(true);
        expect(coursesResult([COURSE])).toEqual([COURSE]);
        expect(noticesResult({ email: false })).toEqual({ email: false });
    });

    it("anything else is not one", () => {
        expect(isWaitlistPlace({ ...PLACE, status: "ACCEPTED" })).toBe(false);
        expect(isWaitlistPlace({ ...PLACE, placeInLine: -1 })).toBe(false);
        expect(isWaitlistPlace({ ...PLACE, startAt: "soon" })).toBe(false);
        expect(waitlistResult(null)).toBe(null);
        expect(isCourse({ ...COURSE, left: 1.5 })).toBe(false);
        expect(isCourse({ ...COURSE, name: null })).toBe(false);
        expect(coursesResult("none")).toBe(null);
        expect(noticesResult({ email: "no" })).toBe(null);
        expect(noticesResult(null)).toBe(null);
    });

    it("the email choice keeps the one field it knows, and nothing sent beside it", () => {
        expect(noticesResult({ email: true, whatsapp: true })).toEqual({
            email: true,
        });
    });
});

describe("a change", () => {
    it("each kind is read by its own fields", () => {
        for (const change of CHANGES) expect(isChange(change)).toBe(true);
    });

    it("an unknown kind, a missing field or a bad time is not one", () => {
        expect(isChange({ ...CHANGES[0], kind: "refund" })).toBe(false);
        expect(isChange({ ...CHANGES[0], number: 1019 })).toBe(false);
        expect(isChange({ ...CHANGES[1], startAt: "tomorrow" })).toBe(false);
        expect(isChange({ ...CHANGES[3], count: 0 })).toBe(false);
        expect(isChange({ ...CHANGES[4], at: "recently" })).toBe(false);
        expect(isChange(null)).toBe(false);
    });
});

describe("Home's newer blocks", () => {
    const ok = <T>(value: T) => ({ ok: true, value });

    it("are read when sent", () => {
        expect(
            homeDetails({
                changes: ok(CHANGES),
                since: "2026-10-09T09:00:00.000Z",
                invoicesDue: ok([INVOICE]),
                waitlist: ok([PLACE]),
                courses: ok([COURSE]),
                linkPending: true,
            }),
        ).toEqual({
            changes: ok(CHANGES),
            since: "2026-10-09T09:00:00.000Z",
            invoicesDue: ok([INVOICE]),
            waitlist: ok([PLACE]),
            courses: ok([COURSE]),
            linkPending: true,
        });
    });

    it("a failed block stays failed, and one in a shape we don't know fails too: never none", () => {
        const read = homeDetails({
            changes: { ok: false },
            invoicesDue: ok([{ ...INVOICE, pay: "later" }]),
            waitlist: ok("nobody"),
            courses: { ok: true },
        });
        expect(read.changes).toEqual({ ok: false });
        expect(read.invoicesDue).toEqual({ ok: false });
        expect(read.waitlist).toEqual({ ok: false });
        expect(read.courses).toEqual({ ok: false });
    });

    it("an API from before them sends none, and none is drawn: not empty, not failed", () => {
        expect(homeDetails({})).toEqual({
            changes: undefined,
            since: null,
            invoicesDue: undefined,
            waitlist: undefined,
            courses: undefined,
            linkPending: false,
        });
    });

    it("a business that takes no bookings has no line at all", () => {
        expect(homeDetails({ waitlist: null }).waitlist).toBeNull();
    });

    it("the linking note needs an explicit yes, and a bad `since` reads as none", () => {
        expect(homeDetails({ linkPending: "true" }).linkPending).toBe(false);
        expect(homeDetails({ linkPending: 1 }).linkPending).toBe(false);
        expect(homeDetails({ since: "last week" }).since).toBeNull();
    });

    it("Home's whole answer carries them beside the blocks it always had", () => {
        const home = homeResult({
            nextBooking: null,
            classes: ok(null),
            orders: ok([]),
            plan: ok(null),
            changes: ok([CHANGES[0]]),
            since: null,
            invoicesDue: ok([INVOICE]),
            waitlist: null,
            courses: ok([]),
            linkPending: false,
        });
        expect(home).toMatchObject({
            nextBooking: null,
            orders: { ok: true, value: [] },
            changes: { ok: true, value: [CHANGES[0]] },
            invoicesDue: { ok: true, value: [INVOICE] },
            waitlist: null,
            courses: { ok: true, value: [] },
            linkPending: false,
        });
    });
});

describe("the removal request (DEC-172, #1107)", () => {
    const REQUEST = {
        ref: "cdr_1",
        status: "open",
        askedAt: "2026-10-19T06:00:00.000Z",
        handledAt: null,
    };

    it("reads an open request, field by field", () => {
        expect(
            dataRequestResult({ request: { ...REQUEST, extra: "x" } }),
        ).toEqual(REQUEST);
    });

    it("reads never having asked as null", () => {
        expect(dataRequestResult({ request: null })).toBeNull();
    });

    it("reads a closed one with its date", () => {
        expect(
            dataRequestResult({
                request: {
                    ...REQUEST,
                    status: "closed",
                    handledAt: "2026-10-20T06:00:00.000Z",
                },
            }),
        ).toMatchObject({ status: "closed" });
    });

    it("a shape it doesn't know is a failed read, never 'never asked'", () => {
        expect(dataRequestResult(null)).toBeUndefined();
        expect(dataRequestResult({})).toBeUndefined();
        expect(
            dataRequestResult({ request: { ...REQUEST, status: "OPEN" } }),
        ).toBeUndefined();
        expect(
            dataRequestResult({ request: { ...REQUEST, askedAt: "soon" } }),
        ).toBeUndefined();
    });
});
