import { describe, expect, it } from "vitest";

import type { BookingDay, BookingService } from "./model";
import {
    buildIcs,
    changeText,
    dateText,
    dayAria,
    dayCountLabel,
    formatMoney,
    groupStarts,
    isBookingDays,
    isBookingPage,
    isBookResult,
    looksLikeEmail,
    orList,
    phoneProblem,
    placesText,
    rulesText,
    serviceLine,
    timeIn,
} from "./model";

const ZONE = "Asia/Kolkata";

const service = (over: Partial<BookingService> = {}): BookingService => ({
    id: "svc_1",
    name: "Personal training",
    description: null,
    durationMinutes: 60,
    kind: "one",
    capacity: 1,
    priceCents: 120_000,
    currency: "INR",
    online: false,
    staff: ["Karan Mehta", "Ritu Kapoor"],
    ...over,
});

const start = (iso: string) => ({
    startAt: iso,
    endAt: iso,
    staffId: "s",
    staffName: "Karan",
    placesLeft: null,
});

describe("the words on the booking page (U19)", () => {
    it("writes whole rupees without paise, as the design does", () => {
        expect(formatMoney(120_000, "INR")).toBe("₹1,200");
        expect(formatMoney(12_050, "INR")).toBe("₹120.50");
        expect(formatMoney(null, "INR")).toBeNull();
    });

    it("says who takes a service the way a person would", () => {
        expect(orList(["Vikram"])).toBe("Vikram");
        expect(orList(["A", "B", "C"])).toBe("A, B or C");
        expect(serviceLine(service())).toBe(
            "60 min · one-to-one · with Karan Mehta or Ritu Kapoor",
        );
        expect(
            serviceLine(service({ kind: "class", capacity: 12, staff: [] })),
        ).toBe("60 min · class of 12");
    });

    it("tells Full from Closed, and shortens on a phone", () => {
        const day = (over: Partial<BookingDay>): BookingDay => ({
            date: "2026-09-20",
            open: true,
            starts: [],
            ...over,
        });
        const three = day({
            starts: [1, 2, 3].map(() => start("2026-09-20T03:30:00Z")),
        });
        expect(dayCountLabel(three, false)).toBe("3 free");
        expect(dayCountLabel(three, true)).toBe("3");
        expect(dayCountLabel(day({}), false)).toBe("Full");
        expect(dayCountLabel(day({ open: false }), false)).toBe("Closed");
        expect(dayCountLabel(day({ open: false }), true)).toBe("Shut");
        expect(dayAria(day({ open: false }))).toBe("Sun 20 Sep: closed");
        expect(dayAria(three)).toBe("Sun 20 Sep: 3 times free");
    });

    it("shows times in the business's zone and groups them by part of day", () => {
        expect(timeIn("2026-09-20T01:30:00Z", ZONE)).toBe("07:00");
        const groups = groupStarts(
            [
                start("2026-09-20T01:30:00Z"), // 07:00
                start("2026-09-20T08:30:00Z"), // 14:00
                start("2026-09-20T13:30:00Z"), // 19:00
            ],
            ZONE,
        );
        expect(groups.map((g) => [g.label, g.starts.length])).toEqual([
            ["Morning", 1],
            ["Afternoon", 1],
            ["Evening", 1],
        ]);
        expect(dateText("2026-09-18", true)).toBe("Fri 18 Sep");
    });

    it("says the rules it has, and only those", () => {
        expect(
            rulesText({
                bookAheadDays: 21,
                latestBookingMinutes: 120,
                freeCancelHours: 12,
            }),
        ).toBe(
            "Free to cancel until 12 hours before the start. Bookings open 21 days ahead and close 2 hours before.",
        );
        expect(
            rulesText({
                bookAheadDays: null,
                latestBookingMinutes: null,
                freeCancelHours: null,
            }),
        ).toBe("");
    });

    it("never points at a message that is not sent", () => {
        const text = changeText("Pulse Fitness", {
            bookAheadDays: null,
            latestBookingMinutes: null,
            freeCancelHours: 12,
        });
        expect(text).toBe(
            "Need to change it? Get in touch with Pulse Fitness. Free to cancel until 12 hours before the start.",
        );
        expect(text).not.toMatch(/email|text|link|SMS/i);
    });

    it("counts a class's places", () => {
        expect(placesText(0)).toBe("Full");
        expect(placesText(1)).toBe("1 place left");
        expect(placesText(6)).toBe("6 places left");
    });

    it("checks an email, and a phone only if one is given", () => {
        expect(looksLikeEmail("asha@example.in")).toBe(true);
        expect(looksLikeEmail("asha@")).toBe(false);
        expect(phoneProblem("")).toBeNull();
        expect(phoneProblem("+91 98450 12345")).toBeNull();
        expect(phoneProblem("98450")).toBe("A phone number needs 10 digits.");
    });

    it("writes a calendar file in UTC", () => {
        const ics = buildIcs({
            reference: "bk_1",
            title: "Personal training · Pulse Fitness",
            startAt: "2026-09-21T01:30:00.000Z",
            endAt: "2026-09-21T02:30:00.000Z",
            description: "Need to change it? Call us, today",
            now: new Date("2026-09-18T04:00:00.000Z"),
        });
        expect(ics).toContain("DTSTART:20260921T013000Z");
        expect(ics).toContain("DTEND:20260921T023000Z");
        expect(ics).toContain("UID:bk_1@bookings.saroh.app");
        expect(ics).toContain(
            "DESCRIPTION:Need to change it? Call us\\, today",
        );
        expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
    });
});

describe("what the API answers, narrowed (#264)", () => {
    const page = {
        businessName: "Pulse Fitness",
        open: true,
        timezone: ZONE,
        payOnline: true,
        rules: {
            bookAheadDays: 21,
            latestBookingMinutes: 120,
            freeCancelHours: 12,
        },
        services: [service()],
    };

    it("accepts the booking page's read, and refuses a wrong shape", () => {
        expect(isBookingPage(page)).toBe(true);
        expect(isBookingPage({ ...page, services: [{ id: 1 }] })).toBe(false);
        expect(isBookingPage({ ...page, rules: null })).toBe(false);
    });

    it("refuses days with a bad date or a bad start", () => {
        const days = {
            timezone: ZONE,
            kind: "one",
            capacity: 1,
            days: [{ date: "2026-09-20", open: true, starts: [] }],
        };
        expect(isBookingDays(days)).toBe(true);
        expect(
            isBookingDays({
                ...days,
                days: [{ date: "20 Sep", open: true, starts: [] }],
            }),
        ).toBe(false);
        expect(
            isBookingDays({
                ...days,
                days: [
                    {
                        date: "2026-09-20",
                        open: true,
                        starts: [{ startAt: "soon" }],
                    },
                ],
            }),
        ).toBe(false);
    });

    it("reads a booking's state, and nothing that is not one", () => {
        const ok = {
            reference: "bk_1",
            startAt: "2026-09-21T01:30:00.000Z",
            endAt: "2026-09-21T02:30:00.000Z",
            serviceName: "Personal training",
            online: false,
            meetingUrl: null,
            state: "HELD",
            holdExpiresAt: "2026-09-18T04:15:00.000Z",
            payToken: "tok",
        };
        expect(isBookResult(ok)).toBe(true);
        expect(isBookResult({ ...ok, state: "PAID" })).toBe(false);
    });
});
