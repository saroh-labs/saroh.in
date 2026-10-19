import { describe, expect, it } from "vitest";

import { FACT_DOT } from "@/lib/format/join";

import type { WhoFields } from "./service-cards";
import {
    isTaking,
    nobodyTakesLine,
    pauseToast,
    SEARCH_FROM,
    serviceLine,
    servicesCount,
    TAKING_LABEL,
    takingPatch,
    takingToast,
    weekLine,
    whoCanBook,
    whoPatch,
} from "./service-cards";

const who = (over: Partial<WhoFields> = {}): WhoFields => ({
    status: "ACTIVE",
    showOnBookingPage: true,
    bookableByTeam: true,
    ...over,
});

type Line = Parameters<typeof serviceLine>[0];
const line = (over: Partial<Line> = {}): Line => ({
    durationMinutes: 45,
    capacity: 1,
    locationType: "IN_PERSON",
    priceCents: 120_000,
    currency: "INR",
    gst: null,
    ...over,
});

/** Facts as the rows join them: the dot held by no-break spaces. */
const facts = (...parts: string[]) => parts.join(FACT_DOT);

describe("Who can book it (DEC-170, Q5)", () => {
    it("names all four mixes of the two boxes; neither is paused", () => {
        expect(whoCanBook(who())).toBe("both");
        expect(whoCanBook(who({ bookableByTeam: false }))).toBe("customers");
        expect(whoCanBook(who({ showOnBookingPage: false }))).toBe("team");
        expect(
            whoCanBook(
                who({ showOnBookingPage: false, bookableByTeam: false }),
            ),
        ).toBe("paused");
    });

    it("reads a service paused the old way, by its status, as paused", () => {
        expect(whoCanBook(who({ status: "ARCHIVED" }))).toBe("paused");
        expect(isTaking(who({ status: "ARCHIVED" }))).toBe(false);
        expect(isTaking(who({ showOnBookingPage: false }))).toBe(true);
    });

    it("off unticks both boxes; on ticks both and takes it off pause", () => {
        expect(takingPatch(false)).toEqual({
            showOnBookingPage: false,
            bookableByTeam: false,
        });
        expect(takingPatch(true)).toEqual({
            status: "ACTIVE",
            showOnBookingPage: true,
            bookableByTeam: true,
        });
    });

    it("Undo sends back only what changed", () => {
        const teamOnly = who({ showOnBookingPage: false });
        const paused = { ...teamOnly, ...takingPatch(false) };
        expect(whoPatch(paused, teamOnly)).toEqual({ bookableByTeam: true });
        const old = who({ status: "ARCHIVED" });
        expect(whoPatch({ ...old, ...takingPatch(true) }, old)).toEqual({
            status: "ARCHIVED",
        });
    });
});

describe("servicesCount", () => {
    it("is one count, and nothing at zero", () => {
        expect(servicesCount([who(), who()], true)).toBe("2 services");
        expect(servicesCount([who()], null)).toBe("1 service");
        expect(servicesCount([], true)).toBeUndefined();
    });

    it("says how many your booking page offers only when that differs", () => {
        const list = [
            who(),
            who({ bookableByTeam: false }),
            who({ showOnBookingPage: false }),
            who({ status: "ARCHIVED" }),
        ];
        expect(servicesCount(list, true)).toBe(
            facts("4 services", "2 on your booking page"),
        );
        expect(servicesCount([who(), who()], true)).not.toContain(
            "booking page",
        );
    });

    it("says there is no booking page yet", () => {
        expect(servicesCount([who()], false)).toBe(
            facts("1 service", "no booking page yet"),
        );
    });
});

describe("serviceLine: how long · price · who", () => {
    it("says the length, the price and who takes it", () => {
        expect(serviceLine(line(), ["Meera"], "INR")).toBe(
            facts("45 min", "₹1,200", "Meera"),
        );
        expect(serviceLine(line(), ["Meera", "Arjun"], "INR")).toBe(
            facts("45 min", "₹1,200", "Meera, Arjun"),
        );
    });

    it("says nobody yet, and leaves who out when it couldn't be read", () => {
        expect(serviceLine(line(), [], "INR")).toBe(
            facts("45 min", "₹1,200", "nobody yet"),
        );
        expect(serviceLine(line(), null, "INR")).toBe(
            facts("45 min", "₹1,200"),
        );
    });

    it("says where when it isn't in person, a class, a pack and visits", () => {
        expect(
            serviceLine(line({ locationType: "ONLINE" }), ["Neha"], "INR"),
        ).toBe(facts("45 min", "online", "₹1,200", "Neha"));
        expect(
            serviceLine(
                line({ capacity: 8, priceCents: 50_000 }),
                ["Neha"],
                "INR",
            ),
        ).toBe(
            facts("45 min", "group class of 8", "₹500 or a pack class", "Neha"),
        );
        expect(
            serviceLine(line({ visits: 4, durationMinutes: 60 }), [], "INR"),
        ).toBe(facts("4 visits of 60 min", "₹1,200", "nobody yet"));
        expect(serviceLine(line({ priceCents: 0 }), ["Neha"], "INR")).toBe(
            facts("45 min", "Free", "Neha"),
        );
    });
});

describe("weekLine", () => {
    it("says what is booked, shorter at the desk under This week", () => {
        const u = { thisWeek: 6, comingUp: 9 };
        expect(weekLine(who(), u, "phone")).toBe(
            facts("6 booked this week", "9 to come"),
        );
        expect(weekLine(who(), u, "desk")).toBe(facts("6 booked", "9 to come"));
    });

    it("says None booked, never two zeroes, and a failed count as such", () => {
        expect(weekLine(who(), { thisWeek: 0, comingUp: 0 }, "phone")).toBe(
            "None booked",
        );
        expect(weekLine(who(), null, "desk")).toBe(
            "Bookings couldn't be counted",
        );
    });

    it("says nobody can book a paused one, and what still happens", () => {
        const paused = who({ showOnBookingPage: false, bookableByTeam: false });
        expect(weekLine(paused, { thisWeek: 0, comingUp: 2 }, "phone")).toBe(
            facts("Nobody can book it", "2 bookings still to come will happen"),
        );
        expect(weekLine(paused, { thisWeek: 0, comingUp: 2 }, "desk")).toBe(
            facts("Nobody can book it", "2 still to come will happen"),
        );
        expect(weekLine(paused, { thisWeek: 0, comingUp: 0 }, "desk")).toBe(
            "Nobody can book it",
        );
    });
});

describe("nobodyTakesLine", () => {
    const sv = (id: string, name: string) => ({ id, name });

    it("says nothing when every service has someone", () => {
        expect(nobodyTakesLine([], 5, true)).toBeNull();
    });

    it("with nobody on the diary: Add who takes bookings", () => {
        expect(nobodyTakesLine([sv("a", "A"), sv("b", "B")], 2, false)).toEqual(
            {
                line: "Nobody takes bookings yet, so each service is booked in its own hours.",
                link: {
                    label: "Add who takes bookings",
                    href: "/bookings/availability",
                },
            },
        );
        expect(nobodyTakesLine([sv("a", "A")], 1, false)?.line).toBe(
            "Nobody takes bookings yet, so it's booked in its own hours.",
        );
    });

    it("names the one service nobody takes, and opens it to choose", () => {
        expect(
            nobodyTakesLine([sv("sv_9", "Online review call")], 6, true),
        ).toEqual({
            line: "Online review call has nobody to take it, so it's booked in its own hours.",
            link: { label: "Choose who", href: "/services/sv_9" },
        });
    });

    it("counts several, and goes to Hours and time off to choose", () => {
        expect(nobodyTakesLine([sv("a", "A"), sv("b", "B")], 6, true)).toEqual({
            line: "2 services have nobody to take them, so they're booked in their own hours.",
            link: { label: "Choose who", href: "/bookings/availability" },
        });
    });
});

describe("the Taking bookings switch", () => {
    it("has one name, and says what flipping it did", () => {
        expect(TAKING_LABEL).toBe("Taking bookings");
        expect(pauseToast("Physio assessment", false)).toBe(
            "Physio assessment paused. Nobody can book it, and bookings already made stay.",
        );
        expect(pauseToast("Physio assessment", true)).toBe(
            "Physio assessment is taking bookings again.",
        );
        // The editor's switch, until U16.
        expect(takingToast("Yoga", false)).toBe("Yoga is bookable again.");
    });

    it("offers a search past 8 services", () => {
        expect(SEARCH_FROM).toBe(9);
    });
});
