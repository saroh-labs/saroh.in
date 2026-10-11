import { describe, expect, it } from "vitest";

import type { AccountBookingRow } from "./bookings-model";
import { bookingOver, bookingTag } from "./bookings-model";
import type {
    AccountCourse,
    AccountInvoiceDue,
    AccountWaitlistPlace,
} from "./details-model";
import {
    bookingHref,
    changeWhen,
    changeWords,
    courseDates,
    courseLine,
    courseNext,
    invoiceLine,
    invoiceTag,
    invoiceTitle,
    orderHref,
    placeHref,
    placeLine,
    placeTitle,
    TO_PAY_HREF,
} from "./details-model";

/**
 * The words of what DEC-142 added to the account: invoices to pay, a
 * class's line, courses, what changed, and a past booking's tag.
 */

const INVOICE: AccountInvoiceDue = {
    ref: "inv_1",
    number: "INV-0042",
    what: "Unlimited, October",
    issuedAt: "2026-10-01T05:00:00.000Z",
    dueAt: "2026-10-08T05:00:00.000Z",
    overdue: false,
    total: "2500.00",
    currency: "INR",
    billOfSupply: false,
    pay: "online",
};

const PLACE: AccountWaitlistPlace = {
    service: "Morning flow",
    serviceRef: "svc_1",
    startAt: "2026-10-14T03:30:00.000Z",
    timezone: "Asia/Kolkata",
    status: "WAITING",
    placeInLine: 3,
    offeredUntil: null,
};

const COURSE: AccountCourse = {
    ref: "enr_1",
    name: "Pottery, four weeks",
    firstAt: "2026-10-05T04:30:00.000Z",
    lastAt: "2026-10-26T04:30:00.000Z",
    timezone: "Asia/Kolkata",
    sessions: 4,
    attended: 1,
    missed: 1,
    left: 2,
    nextAt: "2026-10-19T04:30:00.000Z",
};

const ROW: AccountBookingRow = {
    ref: "bk_1",
    service: "Check-up",
    serviceRef: "svc_9",
    startAt: "2026-10-05T04:30:00.000Z",
    endAt: "2026-10-05T05:00:00.000Z",
    timezone: "Asia/Kolkata",
    staff: null,
    online: null,
    state: "booked",
    kind: "one",
    visit: null,
    cancelledLate: false,
    move: null,
    cancel: null,
};

describe("an invoice to pay", () => {
    it("says its number and amount, what it bills and when it is due", () => {
        expect(invoiceTitle(INVOICE)).toBe("Invoice INV-0042 · ₹2,500");
        expect(invoiceLine(INVOICE, "Pulse Fitness")).toBe(
            "Unlimited, October · Due 8 Oct 2026",
        );
        expect(invoiceTag(INVOICE)).toBe("To pay");
    });

    it("an overdue one says it was due, and is tagged Overdue", () => {
        const late = { ...INVOICE, overdue: true };
        expect(invoiceLine(late, "Pulse Fitness")).toBe(
            "Unlimited, October · Was due 8 Oct 2026",
        );
        expect(invoiceTag(late)).toBe("Overdue");
    });

    it("says how to pay when it can't be paid online: directly, or that autopay is on it", () => {
        expect(
            invoiceLine({ ...INVOICE, pay: "direct" }, "Pulse Fitness"),
        ).toBe(
            "Unlimited, October · Due 8 Oct 2026 · Pay Pulse Fitness directly",
        );
        expect(invoiceLine({ ...INVOICE, pay: "charging" }, "Pulse")).toBe(
            "Unlimited, October · Due 8 Oct 2026 · Autopay charge in progress",
        );
        expect(invoiceLine({ ...INVOICE, pay: "direct" }, "  ")).toContain(
            "Pay the business directly",
        );
    });

    it("with no due date says when it was sent; a bill of supply is named one", () => {
        expect(
            invoiceLine({ ...INVOICE, what: null, dueAt: null }, "Pulse"),
        ).toBe("Sent 1 Oct 2026");
        expect(invoiceTitle({ ...INVOICE, billOfSupply: true })).toBe(
            "Bill of supply INV-0042 · ₹2,500",
        );
        expect(invoiceTitle({ ...INVOICE, number: "" })).toBe(
            "Invoice · ₹2,500",
        );
    });
});

describe("a place in a class's line", () => {
    const now = new Date("2026-10-12T06:00:00Z");

    it("names the class and when, and where they stand", () => {
        expect(placeTitle(PLACE)).toBe("Morning flow · Wed 14 Oct, 9:00 am");
        expect(placeLine(PLACE, now)).toBe("2 people are ahead of you");
        expect(placeLine({ ...PLACE, placeInLine: 2 }, now)).toBe(
            "1 person is ahead of you",
        );
        expect(placeLine({ ...PLACE, placeInLine: 1 }, now)).toBe(
            "You're next in line",
        );
    });

    it("a held place says until when: the time today, the day too when it isn't", () => {
        const held = {
            ...PLACE,
            status: "OFFERED" as const,
            placeInLine: null,
            // 1:00 pm today in Kolkata.
            offeredUntil: "2026-10-12T07:30:00.000Z",
        };
        expect(placeLine(held, now)).toBe(
            "A place is held for you until 1:00 pm",
        );
        expect(
            placeLine(
                { ...held, offeredUntil: "2026-10-13T03:30:00.000Z" },
                now,
            ),
        ).toBe("A place is held for you until Tue 13 Oct, 9:00 am");
        expect(placeLine({ ...held, offeredUntil: null }, now)).toBe(
            "A place is held for you",
        );
    });

    it("its place is booked on the booking page, opened on that class's day", () => {
        expect(placeHref(PLACE)).toBe("/book?service=svc_1&date=2026-10-14");
        // An unknown zone: the class's page, without the day.
        expect(placeHref({ ...PLACE, timezone: "Not/AZone" })).toBe(
            "/book?service=svc_1",
        );
    });
});

describe("a course", () => {
    it("says its dates once the year, their sessions and the next one", () => {
        expect(courseDates(COURSE)).toBe("5 Oct to 26 Oct 2026");
        expect(courseLine(COURSE)).toBe(
            "4 sessions · 1 attended · 1 missed · 2 to come",
        );
        expect(courseNext(COURSE)).toBe("Next: Mon 19 Oct, 10:00 am");
    });

    it("leaves out what is zero, and says when it has finished", () => {
        const done = {
            ...COURSE,
            sessions: 1,
            attended: 0,
            missed: 0,
            left: 0,
            nextAt: null,
            lastAt: COURSE.firstAt,
        };
        expect(courseLine(done)).toBe("1 session · 0 to come");
        expect(courseNext(done)).toBe("Finished");
        expect(courseDates(done)).toBe("5 Oct 2026");
        expect(
            courseDates({ ...COURSE, lastAt: "2027-01-11T04:30:00.000Z" }),
        ).toBe("5 Oct 2026 to 11 Jan 2027");
        expect(courseDates({ ...COURSE, firstAt: null, lastAt: null })).toBe(
            "",
        );
        expect(courseNext({ ...done, sessions: 0 })).toBe("");
    });
});

describe("what changed since they were last here", () => {
    it("names the business, never the person, and leads to the thing", () => {
        expect(
            changeWords(
                {
                    kind: "order",
                    ref: "ord 1",
                    number: "1019",
                    status: "Ready",
                    at: "2026-10-11T09:00:00.000Z",
                },
                "Rye & Co.",
                "/account/messages",
            ),
        ).toEqual({
            text: "Order #1019: Ready",
            href: "/account/orders/ord%201",
        });
        expect(
            changeWords(
                {
                    kind: "booking-moved",
                    ref: "bk_1",
                    service: "Check-up",
                    startAt: "2026-10-15T05:00:00.000Z",
                    timezone: "Asia/Kolkata",
                    at: "2026-10-11T09:00:00.000Z",
                },
                "Kavi Dental",
                null,
            ),
        ).toEqual({
            text: "Kavi Dental moved Check-up to Thu 15 Oct, 10:30 am",
            href: "/account/bookings/bk_1",
        });
        expect(
            changeWords(
                {
                    kind: "booking-cancelled",
                    ref: "bk_1",
                    service: "Check-up",
                    startAt: "2026-10-14T05:00:00.000Z",
                    timezone: "Asia/Kolkata",
                    at: "2026-10-11T09:00:00.000Z",
                },
                "Kavi Dental",
                null,
            ).text,
        ).toBe("Kavi Dental cancelled Check-up on Wed 14 Oct, 10:30 am");
    });

    it("counts new messages, and points an invoice at where it is paid", () => {
        const at = "2026-10-11T09:00:00.000Z";
        expect(
            changeWords(
                { kind: "messages", count: 1, at },
                "Kavi Dental",
                "/m",
            ),
        ).toEqual({ text: "A new message from Kavi Dental", href: "/m" });
        expect(
            changeWords(
                { kind: "messages", count: 3, at },
                "Kavi Dental",
                null,
            ),
        ).toEqual({ text: "3 new messages from Kavi Dental", href: null });
        expect(
            changeWords(
                {
                    kind: "invoice",
                    ref: "inv_1",
                    number: "INV-0042",
                    total: "2500.00",
                    currency: "INR",
                    at,
                },
                "Kavi Dental",
                null,
            ),
        ).toEqual({
            text: "An invoice to pay: INV-0042 · ₹2,500",
            href: TO_PAY_HREF,
        });
    });

    it("says when in the visitor's own days: Today, Yesterday, then the date", () => {
        const now = new Date("2026-10-12T06:00:00Z");
        const zone = "Asia/Kolkata";
        expect(changeWhen("2026-10-12T01:00:00Z", now, zone)).toBe("Today");
        // 11 Oct, 11:30 pm in Kolkata.
        expect(changeWhen("2026-10-11T18:00:00Z", now, zone)).toBe("Yesterday");
        // 12 Oct already, in Kolkata, though still the 11th in UTC.
        expect(changeWhen("2026-10-11T19:00:00Z", now, zone)).toBe("Today");
        expect(changeWhen("2026-10-03T06:00:00Z", now, zone)).toBe("3 Oct");
        expect(changeWhen("2025-12-30T06:00:00Z", now, zone)).toBe(
            "30 Dec 2025",
        );
        expect(changeWhen("not a date", now, zone)).toBe("");
    });
});

describe("where a thing's own page lives", () => {
    it("is under its tab, by its ref, escaped", () => {
        expect(orderHref("ord_1")).toBe("/account/orders/ord_1");
        expect(bookingHref("a/b")).toBe("/account/bookings/a%2Fb");
        expect(TO_PAY_HREF).toBe("/account/me#to-pay");
    });
});

describe("a booking that is over (DEC-142)", () => {
    it('never reads "Booked": its date alone, until the business marks it', () => {
        expect(bookingTag(ROW)).toBe("Booked");
        expect(bookingTag(ROW, true)).toBeNull();
        expect(bookingTag({ ...ROW, state: "attended" }, true)).toBe(
            "Attended",
        );
        expect(bookingTag({ ...ROW, state: "missed" }, true)).toBe("Missed");
        expect(bookingTag({ ...ROW, state: "cancelled" }, true)).toBe(
            "Cancelled",
        );
    });

    it("is over once its end has passed", () => {
        expect(bookingOver(ROW, new Date("2026-10-05T04:59:00Z"))).toBe(false);
        expect(bookingOver(ROW, new Date("2026-10-05T05:00:00Z"))).toBe(true);
        expect(bookingOver({ ...ROW, endAt: "nonsense" }, new Date())).toBe(
            false,
        );
    });
});
