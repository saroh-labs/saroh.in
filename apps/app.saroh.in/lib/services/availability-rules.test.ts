import { describe, expect, it } from "vitest";

import {
    gapLabel,
    outsideHours,
    payWayBlocked,
    payWayHint,
    payWayOf,
    refundsInTime,
    ruleBefore,
    ruleChoices,
    rulePatch,
    ruleRows,
    sameHours,
} from "./availability-rules";

const MON = { dayOfWeek: 1, startMinute: 360, endMinute: 600 };
const MON_PM = { dayOfWeek: 1, startMinute: 1020, endMinute: 1260 };
const SAT = { dayOfWeek: 6, startMinute: 480, endMinute: 720 };

const RULES = {
    bookAheadDays: 28,
    latestBookingMinutes: 120,
    freeCancelHours: 12,
};

describe("outsideHours", () => {
    it("lists kept bookings the new hours no longer cover", () => {
        const kept = [
            {
                id: "b1",
                staffId: "st_vikram",
                weekday: 1,
                start: 420,
                who: "Tariq",
            },
            {
                id: "b2",
                staffId: "st_vikram",
                weekday: 1,
                start: 1080,
                who: "Priya",
            },
            {
                id: "b3",
                staffId: "st_other",
                weekday: 1,
                start: 1080,
                who: "Kiran",
            },
        ];
        expect(
            outsideHours(kept, "st_vikram", [MON], 1).map((b) => b.who),
        ).toEqual(["Priya"]);
    });
});

describe("the refund policy (E30, DEC-058)", () => {
    it("reads as on when an older API leaves it out, or never set", () => {
        expect(refundsInTime(RULES)).toBe(true);
        expect(refundsInTime({ ...RULES, refundInTimeCancels: false })).toBe(
            false,
        );
    });

    it("turning it off is that one field, with the old policy for Undo", () => {
        const before = { ...RULES, refundInTimeCancels: true };
        expect(rulePatch("refundInTimeCancels", "keep")).toEqual({
            refundInTimeCancels: false,
        });
        expect(ruleBefore("refundInTimeCancels", before)).toEqual({
            refundInTimeCancels: true,
        });
        // Left out by an older API: put back as on, which is what it was.
        expect(ruleBefore("refundInTimeCancels", RULES)).toEqual({
            refundInTimeCancels: true,
        });
    });
});

describe("ruleChoices", () => {
    it("offers the design's choices, no limit, and a current value off the list", () => {
        const [ahead, latest] = ruleChoices({
            bookAheadDays: 21,
            latestBookingMinutes: 120,
            freeCancelHours: null,
        });
        expect(ahead.options.map((o) => o.label)).toEqual([
            "1 week",
            "2 weeks",
            "4 weeks",
            "8 weeks",
            "No limit",
            "3 weeks",
        ]);
        expect(latest.options.find((o) => o.value === "120")?.label).toBe(
            "2 hours before",
        );
    });
});

describe("how people pay when they book (DEC-088)", () => {
    it("reads as Both when an older API leaves it out", () => {
        expect(payWayOf(RULES)).toBe("BOTH");
        expect(payWayOf({ ...RULES, bookingPayment: "DESK" })).toBe("DESK");
    });

    it("changing it is that one field, with the old way for Undo", () => {
        expect(rulePatch("bookingPayment", "ONLINE")).toEqual({
            bookingPayment: "ONLINE",
        });
        // Left out by an older API: Both goes back, which is what it was.
        expect(ruleBefore("bookingPayment", RULES)).toEqual({
            bookingPayment: "BOTH",
        });
    });

    it("says what each way means, and why online can't be taken when it matters", () => {
        expect(payWayHint("BOTH", null)).toBe(
            "People pay online when they book, or at the desk. A deposit is paid online, or at the desk when you can't take payment online.",
        );
        expect(payWayHint("DESK", "NO_PROVIDER")).toBe(
            "Nobody pays on the booking page. They pay when they come, a deposit too.",
        );
        expect(payWayHint("ONLINE", "NO_PROVIDER")).toBe(
            "Everyone pays on the booking page when they book. Free services book with nothing to pay. Right now no payment provider is connected, so nobody can book a service with a price online.",
        );
        expect(payWayHint("BOTH", "PAYMENTS_OFF")).toBe(
            "People pay online when they book, or at the desk. A deposit is paid online, or at the desk when you can't take payment online. Right now Payments is switched off, so everything is paid at the desk.",
        );
        // Couldn't tell: says nothing more.
        expect(payWayHint("ONLINE", undefined)).toBe(
            "Everyone pays on the booking page when they book. Free services book with nothing to pay.",
        );
    });
});

describe("ruleRows: each rule as a sentence in a row", () => {
    const said = (rules: Parameters<typeof ruleRows>[0]) =>
        ruleRows(rules).map((r) => r.sentence);

    it("says every rule whole, with no label needed to read it", () => {
        expect(
            said({
                bookAheadDays: 60,
                latestBookingMinutes: 120,
                freeCancelHours: 12,
                refundInTimeCancels: true,
                bookingPayment: "BOTH",
            }),
        ).toEqual([
            "Up to 60 days ahead",
            "Up to 2 hours before the start",
            "Free to cancel up to 12 hours before",
            "Pay online or at the desk",
            "Cancelled in time: refund what they paid online",
        ]);
    });

    it("says no rule in words too, never a bare 'Any time before'", () => {
        expect(
            said({
                bookAheadDays: null,
                latestBookingMinutes: null,
                freeCancelHours: null,
                refundInTimeCancels: false,
                bookingPayment: "DESK",
            }),
        ).toEqual([
            "No limit on how far ahead",
            "Up to the start time",
            "Free to cancel any time before",
            "Pay at the desk",
            "Cancelled in time: don't refund automatically",
        ]);
        expect(said({ ...RULES, bookAheadDays: 56 })[0]).toBe(
            "Up to 8 weeks ahead",
        );
    });

    it("offers the same choices as before, with the help they had", () => {
        const rows = ruleRows(
            { ...RULES, bookAheadDays: 21, bookingPayment: "ONLINE" },
            "NO_PROVIDER",
        );
        expect(rows.map((r) => r.key)).toEqual([
            "bookAheadDays",
            "latestBookingMinutes",
            "freeCancelHours",
            "bookingPayment",
            "refundInTimeCancels",
        ]);
        // The saved value is one of the choices, off the list or not.
        for (const row of rows) {
            expect(row.options.map((o) => o.value)).toContain(row.value);
        }
        const pay = rows.at(3);
        expect(pay?.options.map((o) => o.label)).toEqual([
            "Both",
            "Online",
            "At the desk",
        ]);
        expect(pay?.options[1]?.note).toBe(payWayHint("ONLINE", "NO_PROVIDER"));
        expect(rows[4]?.hint).toMatch(/A late cancel is never refunded/);
    });

    it("turns a choice into the one field it changes, null for no limit", () => {
        expect(rulePatch("bookAheadDays", "28")).toEqual({ bookAheadDays: 28 });
        expect(rulePatch("freeCancelHours", "")).toEqual({
            freeCancelHours: null,
        });
        expect(ruleBefore("latestBookingMinutes", RULES)).toEqual({
            latestBookingMinutes: RULES.latestBookingMinutes,
        });
    });

    it("says why online can't be taken apart from what the way means", () => {
        expect(payWayBlocked("BOTH", "PAYMENTS_OFF")).toBe(
            "Right now Payments is switched off, so everything is paid at the desk.",
        );
        expect(payWayBlocked("DESK", "NO_PROVIDER")).toBeNull();
        expect(payWayBlocked("ONLINE", null)).toBeNull();
    });
});

describe("Gap between bookings (DEC-170, #1038)", () => {
    it("is a row only when the API has it, after booking late", () => {
        expect(ruleRows(RULES).map((r) => r.key)).not.toContain("gapMinutes");
        const rows = ruleRows({ ...RULES, gapMinutes: 15 });
        expect(rows.map((r) => r.key)).toEqual([
            "bookAheadDays",
            "latestBookingMinutes",
            "gapMinutes",
            "freeCancelHours",
            "bookingPayment",
            "refundInTimeCancels",
        ]);
        const gap = rows.find((r) => r.key === "gapMinutes");
        expect(gap?.sentence).toBe("15 min between bookings");
        expect(gap?.options.map((o) => o.label)).toEqual([
            "No gap needed",
            "10 min between bookings",
            "15 min between bookings",
            "30 min between bookings",
        ]);
    });

    it("says no gap in words, saves a number, and puts the old one back", () => {
        expect(gapLabel(0)).toBe("No gap needed");
        expect(rulePatch("gapMinutes", "30")).toEqual({ gapMinutes: 30 });
        expect(ruleBefore("gapMinutes", { ...RULES, gapMinutes: 10 })).toEqual({
            gapMinutes: 10,
        });
        expect(ruleBefore("gapMinutes", RULES)).toEqual({ gapMinutes: 0 });
    });
});

describe("sameHours", () => {
    it("is order-blind, so a save that changes nothing is not sent", () => {
        expect(sameHours([MON, SAT], [SAT, MON])).toBe(true);
        expect(sameHours([MON], [MON, MON_PM])).toBe(false);
    });
});
