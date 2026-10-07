import { describe, expect, it } from "vitest";

import type { BookingDay, BookingService } from "./model";
import {
    asksWhere,
    bookingPaymentOf,
    buildIcs,
    changeText,
    creditChoice,
    creditUsedText,
    dateText,
    dayAria,
    dayCountLabel,
    firstVisitText,
    formatMoney,
    groupStarts,
    isBookingDays,
    isBookingPage,
    isBookResult,
    isCreditAnswer,
    isHoldView,
    laterVisitsText,
    looksLikeEmail,
    orList,
    payChoices,
    phoneProblem,
    placesText,
    restAfterDeposit,
    rulesText,
    serviceLine,
    serviceWhere,
    timeIn,
    unpayableText,
    visitsOf,
    whereLabel,
    whereText,
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

    it("tells Full from Closed from No times, and shortens only the count on a phone", () => {
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
        // The business is closed that day: Closed, on both (UX-054).
        const shut = day({ open: false, closed: true });
        expect(dayCountLabel(shut, false)).toBe("Closed");
        expect(dayCountLabel(shut, true)).toBe("Closed");
        expect(dayAria(shut)).toBe("Sun 20 Sep: closed");
        // Open, but nobody takes this service that day: never "Closed".
        const none = day({ open: false, closed: false });
        expect(dayCountLabel(none, false)).toBe("No times");
        expect(dayCountLabel(none, true)).toBe("No times");
        expect(dayAria(none)).toBe("Sun 20 Sep: no times");
        // An older API that doesn't say: No times, never a false Closed.
        expect(dayCountLabel(day({ open: false }), false)).toBe("No times");
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
        // Signed in, it is moved or cancelled from their bookings (UX-055).
        expect(
            changeText(
                "Pulse Fitness",
                {
                    bookAheadDays: null,
                    latestBookingMinutes: null,
                    freeCancelHours: 12,
                },
                false,
                true,
            ),
        ).toBe(
            "Need to change it? Move or cancel it from your bookings on Pulse Fitness's website. Free to cancel until 12 hours before the start.",
        );
    });

    it("states a no-refund policy only to someone paying online (E30)", () => {
        const kept = {
            bookAheadDays: null,
            latestBookingMinutes: null,
            freeCancelHours: 12,
            refundInTimeCancels: false,
        };
        expect(rulesText(kept, true)).toBe(
            "Free to cancel until 12 hours before the start. What you pay online isn't refunded automatically if you cancel.",
        );
        expect(rulesText(kept, false)).toBe(
            "Free to cancel until 12 hours before the start.",
        );
        expect(changeText("Kavi Dental", kept, true)).toBe(
            "Need to change it? Get in touch with Kavi Dental. Free to cancel until 12 hours before the start. What you pay online isn't refunded automatically if you cancel.",
        );
        // On, or from an API older than the policy: reads as before.
        const on = { ...kept, refundInTimeCancels: true };
        expect(rulesText(on, true)).toBe(
            "Free to cancel until 12 hours before the start.",
        );
        expect(changeText("Kavi Dental", on, true)).toBe(
            "Need to change it? Get in touch with Kavi Dental. Free to cancel until 12 hours before the start.",
        );
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

describe("Where (E7)", () => {
    const page = {
        businessName: "Kavi Dental",
        open: true,
        timezone: ZONE,
        payOnline: false,
        rules: {
            bookAheadDays: null,
            latestBookingMinutes: null,
            freeCancelHours: null,
        },
    };

    it("reads where a service happens, from an API with or without it", () => {
        expect(serviceWhere(service({ where: "EITHER" }))).toBe("EITHER");
        expect(serviceWhere(service({ online: true }))).toBe("ONLINE");
        expect(serviceWhere(service())).toBe("IN_PERSON");
        expect(
            isBookingPage({
                ...page,
                services: [service({ where: "EITHER" })],
            }),
        ).toBe(true);
        expect(isBookingPage({ ...page, services: [service()] })).toBe(true);
        expect(
            isBookingPage({
                ...page,
                services: [{ ...service(), where: "HOME_VISIT" }],
            }),
        ).toBe(false);
    });

    it("asks only for a service offered either way", () => {
        expect(asksWhere(service({ where: "EITHER" }))).toBe(true);
        expect(asksWhere(service({ where: "ONLINE", online: true }))).toBe(
            false,
        );
        expect(asksWhere(service({ where: "IN_PERSON" }))).toBe(false);
        expect(asksWhere(null)).toBe(false);
    });

    it("names the two answers", () => {
        expect(whereLabel("IN_PERSON", "Kavi Dental")).toBe("At Kavi Dental");
        expect(whereLabel("ONLINE", "Kavi Dental")).toBe("Video call");
    });

    it("says where a booking happens only for a business that also works online", () => {
        const either = service({ where: "EITHER" });
        const clinic = service({ where: "IN_PERSON" });
        const both = [either, clinic];
        expect(whereText(either, { online: true }, both, "Kavi Dental")).toBe(
            "Video call",
        );
        expect(whereText(either, { online: false }, both, "Kavi Dental")).toBe(
            "At Kavi Dental",
        );
        expect(whereText(clinic, { online: false }, both, "Kavi Dental")).toBe(
            "At Kavi Dental",
        );
        expect(
            whereText(clinic, { online: false }, [clinic], "Pulse Fitness"),
        ).toBeNull();
    });

    it("narrows a hold's answer, with or without its booking", () => {
        const hold = { state: "CONFIRMED", holdExpiresAt: null };
        expect(isHoldView(hold)).toBe(true);
        expect(
            isHoldView({
                ...hold,
                booking: { online: true, meetingUrl: "https://meet.x/y" },
            }),
        ).toBe(true);
        expect(
            isHoldView({
                ...hold,
                booking: { online: "yes", meetingUrl: null },
            }),
        ).toBe(false);
    });
});

describe("paying at booking (E8)", () => {
    const pays = (over: Partial<BookingService>, online = true) =>
        payChoices(service(over), online, "Kavi Dental").map((c) => c.pay);

    it("a deposit: the deposit or the full price, never the desk", () => {
        const choices = payChoices(
            service({ depositCents: 30_000 }),
            true,
            "Kavi Dental",
        );
        expect(choices.map((c) => [c.pay, c.label, c.amount])).toEqual([
            ["DEPOSIT", "Pay ₹300 deposit now", "₹300"],
            ["NOW", "Pay the full ₹1,200 now", "₹1,200"],
        ]);
        expect(choices[0]?.sub).toBe(
            "The rest (₹900) at Kavi Dental. Refunded if you cancel in time.",
        );
        expect(restAfterDeposit(service({ depositCents: 30_000 }))).toBe(
            "₹900",
        );
    });

    it("the full price as a deposit is paying now", () => {
        expect(pays({ depositCents: 120_000 })).toEqual(["NOW"]);
        expect(restAfterDeposit(service({ depositCents: 120_000 }))).toBe(null);
    });

    it("no deposit: now or at the desk, as before; only the desk offline", () => {
        expect(pays({ depositCents: null })).toEqual(["NOW", "DESK"]);
        expect(pays({})).toEqual(["NOW", "DESK"]);
        expect(pays({}, false)).toEqual(["DESK"]);
    });

    it("a deposit that can't be taken online is paid at the desk, under Both (DEC-089)", () => {
        const choices = payChoices(
            service({ depositCents: 30_000 }),
            false,
            "Kavi Dental",
        );
        expect(choices.map((c) => [c.pay, c.label, c.amount])).toEqual([
            ["DESK", "Pay at the desk", "₹1,200"],
        ]);
        expect(
            unpayableText(service({ depositCents: 30_000 }), false, "Kavi"),
        ).toBeNull();
        expect(
            unpayableText(service({ depositCents: 30_000 }), true, "Kavi"),
        ).toBeNull();
        expect(unpayableText(service(), false, "Kavi")).toBeNull();
    });

    describe("as the business allows (DEC-088)", () => {
        const ways = ["BOTH", "ONLINE", "DESK"] as const;
        const choose = (
            over: Partial<BookingService>,
            online: boolean,
            way: (typeof ways)[number],
        ) =>
            payChoices(service(over), online, "Kavi Dental", way).map(
                (c) => c.pay,
            );
        const unpayable = (
            over: Partial<BookingService>,
            online: boolean,
            way: (typeof ways)[number],
        ) => unpayableText(service(over), online, "Kavi Dental", way);

        it.each([
            // way, payOnline, no deposit, a deposit, the full price
            // A deposit online can't take is paid at the desk wherever the
            // desk is allowed (DEC-089); under online only, nothing.
            ["BOTH", true, ["NOW", "DESK"], ["DEPOSIT", "NOW"], ["NOW"]],
            ["BOTH", false, ["DESK"], ["DESK"], ["DESK"]],
            ["ONLINE", true, ["NOW"], ["DEPOSIT", "NOW"], ["NOW"]],
            ["ONLINE", false, [], [], []],
            ["DESK", true, ["DESK"], ["DESK"], ["DESK"]],
            ["DESK", false, ["DESK"], ["DESK"], ["DESK"]],
        ] as const)(
            "%s, online %s: no deposit %j, a deposit %j, the full price %j",
            (way, online, none, part, full) => {
                expect(choose({}, online, way)).toEqual(none);
                expect(choose({ depositCents: 30_000 }, online, way)).toEqual(
                    part,
                );
                expect(choose({ depositCents: 120_000 }, online, way)).toEqual(
                    full,
                );
            },
        );

        it("says get in touch exactly when a priced service has nothing to pay with", () => {
            for (const way of ways) {
                for (const online of [true, false]) {
                    for (const deposit of [null, 30_000]) {
                        const over = { depositCents: deposit };
                        expect(unpayable(over, online, way) !== null).toBe(
                            choose(over, online, way).length === 0,
                        );
                    }
                }
            }
            expect(unpayable({}, false, "ONLINE")).toBe(
                "Kavi Dental can't take payment online right now. Get in touch with them to book.",
            );
            expect(unpayable({ depositCents: 30_000 }, false, "ONLINE")).toBe(
                "Kavi Dental can't take the deposit online right now. Get in touch with them to book.",
            );
            // Both and At the desk never say get in touch (DEC-089).
            for (const way of ["BOTH", "DESK"] as const) {
                for (const online of [true, false]) {
                    expect(
                        unpayable({ depositCents: 30_000 }, online, way),
                    ).toBeNull();
                }
            }
        });

        it("a service with no price books with nothing to pay, whatever the rule", () => {
            for (const way of ways) {
                expect(choose({ priceCents: null }, false, way)).toEqual([]);
                expect(unpayable({ priceCents: null }, false, way)).toBeNull();
            }
        });

        it("reads an absent or unknown way as both", () => {
            const rules = {
                bookAheadDays: null,
                latestBookingMinutes: null,
                freeCancelHours: null,
            };
            expect(bookingPaymentOf(rules)).toBe("BOTH");
            expect(
                bookingPaymentOf({
                    ...rules,
                    bookingPayment: "CASH" as never,
                }),
            ).toBe("BOTH");
            expect(bookingPaymentOf({ ...rules, bookingPayment: "DESK" })).toBe(
                "DESK",
            );
        });
    });

    it("no price, nothing to choose", () => {
        expect(pays({ priceCents: null })).toEqual([]);
    });

    it("reads a page with or without depositCents", () => {
        const page = {
            businessName: "Kavi Dental",
            open: true,
            timezone: ZONE,
            payOnline: true,
            rules: {
                bookAheadDays: null,
                latestBookingMinutes: null,
                freeCancelHours: 24,
            },
            services: [service(), service({ depositCents: 30_000 })],
        };
        expect(isBookingPage(page)).toBe(true);
        expect(
            isBookingPage({
                ...page,
                services: [{ ...service(), depositCents: "300" }],
            }),
        ).toBe(false);
    });
});

describe("a class credit (A10)", () => {
    const PACK = {
        kind: "PACK" as const,
        id: "pp_1",
        name: "10 classes",
        left: 1,
        useBy: "2026-11-12",
    };
    const MEMBER = {
        kind: "MEMBERSHIP" as const,
        id: "sub_1",
        name: "Monthly 8",
        left: 8,
        allowance: 8,
        resetsOn: "2027-01-01",
    };

    it("reads the credit answer, and refuses a wrong shape", () => {
        expect(isCreditAnswer({ credit: null })).toBe(true);
        expect(isCreditAnswer({ credit: PACK })).toBe(true);
        expect(isCreditAnswer({ credit: MEMBER })).toBe(true);
        expect(isCreditAnswer({})).toBe(false);
        expect(isCreditAnswer({ credit: { ...PACK, left: "1" } })).toBe(false);
        expect(isCreditAnswer({ credit: { ...PACK, useBy: "soon" } })).toBe(
            false,
        );
        expect(isCreditAnswer({ credit: { ...MEMBER, kind: "PLAN" } })).toBe(
            false,
        );
    });

    it("words the pay option: a pack's last day, a membership's reset and Included", () => {
        expect(creditChoice(PACK, "INR")).toEqual({
            pay: "CREDIT",
            label: "Use 1 credit (1 left)",
            sub: "10 classes pack · use by 12 Nov",
            amount: "₹0",
        });
        expect(creditChoice({ ...PACK, name: "Starter pack" }, "INR").sub).toBe(
            "Starter pack · use by 12 Nov",
        );
        expect(creditChoice(MEMBER, "INR")).toMatchObject({
            label: "Use 1 credit (8 left)",
            sub: "Membership · resets 1 Jan",
            tag: "Included",
        });
    });

    it("says what is left once used: never below none, and the class's month", () => {
        expect(creditUsedText(PACK)).toBe(
            "Used 1 credit from your 10 classes pack — 0 left, use by 12 Nov.",
        );
        expect(creditUsedText(MEMBER)).toBe(
            "Used 1 credit from your membership — 7 left in December.",
        );
    });
});

describe("visits (E10)", () => {
    it("reads a service without visits, or with one, as one visit", () => {
        expect(visitsOf(service())).toBe(1);
        expect(visitsOf(service({ visits: 1 }))).toBe(1);
        expect(visitsOf(null)).toBe(1);
        expect(visitsOf(service({ visits: 3 }))).toBe(3);
    });

    it("names the visits in the service's line", () => {
        expect(serviceLine(service({ visits: 3, staff: [] }))).toBe(
            "3 visits of 60 min · one-to-one",
        );
    });

    it("says when the later visits are booked", () => {
        expect(laterVisitsText(1)).toBeNull();
        expect(laterVisitsText(2)).toBe(
            "We'll book visit 2 with you at the first appointment",
        );
        expect(laterVisitsText(3)).toBe(
            "We'll book visits 2 and 3 with you at the first appointment",
        );
        expect(laterVisitsText(6)).toBe(
            "We'll book visits 2 to 6 with you at the first appointment",
        );
        expect(firstVisitText(1)).toBeNull();
        expect(firstVisitText(3)).toBe(
            "Visit 1 of 3. We'll book the rest with you then",
        );
    });

    it("pays for all the visits at once", () => {
        const choices = payChoices(service({ visits: 3 }), true, "Kavi Dental");
        expect(choices.map((c) => c.label)).toEqual([
            "Pay ₹1,200 for all 3 visits now",
            "Pay at the desk",
        ]);
    });

    it("accepts visits in the page's read, and refuses a wrong one", () => {
        const page = {
            businessName: "Kavi Dental",
            open: true,
            timezone: ZONE,
            payOnline: true,
            rules: {
                bookAheadDays: null,
                latestBookingMinutes: null,
                freeCancelHours: null,
            },
            services: [service({ visits: 3 })],
        };
        expect(isBookingPage(page)).toBe(true);
        expect(
            isBookingPage({
                ...page,
                services: [{ ...service(), visits: "3" }],
            }),
        ).toBe(false);
    });
});
