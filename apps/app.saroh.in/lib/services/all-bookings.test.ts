import { describe, expect, it } from "vitest";

import {
    dayLabel,
    defaultOrder,
    emptyView,
    groupByDay,
    inView,
    matchesMore,
    matchesSearch,
    moreChoices,
    moreCount,
    NO_MORE,
    ordered,
    personLabel,
    readView,
    rowMenu,
    rowStatus,
    takeLabel,
    UNASSIGNED,
    viewCounts,
} from "./all-bookings";
import type { DiaryBooking } from "./booking-calendar";

const ZONE = "Asia/Kolkata";
/** Mon 19 Oct 2026, 12:00 pm IST. */
const NOW = Date.parse("2026-10-19T06:30:00.000Z");
const HOUR = 3_600_000;

let n = 0;
/** A one-to-one at `startHours` from now (IST), 45 minutes long. */
function booking(
    startHours: number,
    over: Partial<DiaryBooking> = {},
): DiaryBooking {
    n += 1;
    const start = NOW + startHours * HOUR;
    return {
        id: `bk_${n}`,
        serviceId: "svc_physio",
        startAt: new Date(start).toISOString(),
        endAt: new Date(start + 45 * 60_000).toISOString(),
        timezone: ZONE,
        status: "CONFIRMED",
        outcome: null,
        bookerName: null,
        bookerEmail: null,
        bookerPhone: "+91 98765 43210",
        createdAt: "2026-10-01T00:00:00.000Z",
        cancelledAt: null,
        cancelledLate: false,
        service: {
            id: "svc_physio",
            name: "Physio assessment",
            timezone: ZONE,
            capacity: 1,
            durationMinutes: 45,
            priceCents: 80000,
            currency: "INR",
        },
        contact: {
            id: "ct_kabir",
            firstName: "Kabir",
            lastName: "Singh",
            email: "kabir.singh@example.com",
        },
        staff: { id: "st_meera", name: "Meera" },
        paidWith: "PAID",
        packName: null,
        subscriptionId: null,
        take: null,
        ...over,
    };
}

describe("views", () => {
    it("reads ?view=, falling back to Upcoming", () => {
        expect(readView("outcome")).toBe("outcome");
        // Awaiting payment keeps the id it had as "To confirm".
        expect(readView("unconfirmed")).toBe("unconfirmed");
        expect(readView("nope")).toBe("upcoming");
        expect(readView(undefined)).toBe("upcoming");
    });

    it("counts each view, in the business's zone", () => {
        const rows = [
            booking(-3), // ended this morning, unmarked
            booking(-3, { outcome: "ATTENDED" }),
            booking(-50), // Sat, unmarked
            booking(-50, { status: "CANCELLED" }),
            booking(1), // later today
            booking(20, { status: "PENDING" }), // tomorrow
            booking(24 * 9), // past next week
        ];
        expect(viewCounts(rows, NOW, ZONE)).toEqual({
            upcoming: 3,
            outcome: 2,
            unconfirmed: 1,
            today: 3,
            week: 2,
            all: 7,
        });
    });

    it("Needs an outcome is the past, unmarked and not cancelled", () => {
        expect(inView("outcome", booking(-2), NOW, ZONE)).toBe(true);
        expect(
            inView("outcome", booking(-2, { outcome: "NO_SHOW" }), NOW, ZONE),
        ).toBe(false);
        expect(
            inView("outcome", booking(-2, { status: "CANCELLED" }), NOW, ZONE),
        ).toBe(false);
        expect(inView("outcome", booking(2), NOW, ZONE)).toBe(false);
    });

    it("says what an empty view means, never 'No bookings yet'", () => {
        expect(emptyView("unconfirmed", 42)).toEqual({
            title: "Nothing awaiting payment",
            line: "Every booking made with a payment link has been paid. 42 bookings in all.",
        });
        expect(emptyView("outcome", 1).line).toContain("1 booking in all.");
        expect(emptyView("upcoming", 3).title).toBe("Nothing coming up");
    });
});

describe("search and More filters", () => {
    it("finds by name, phone or service", () => {
        const b = booking(1);
        expect(matchesSearch(b, "kabir")).toBe(true);
        expect(matchesSearch(b, "physio")).toBe(true);
        expect(matchesSearch(b, "98765")).toBe(true);
        expect(matchesSearch(b, "meera")).toBe(true);
        expect(matchesSearch(b, "zara")).toBe(false);
        expect(matchesSearch(b, "  ")).toBe(true);
    });

    it("narrows by service, who it is with and status", () => {
        const b = booking(1);
        expect(matchesMore(b, NO_MORE)).toBe(true);
        expect(matchesMore(b, { ...NO_MORE, service: "svc_other" })).toBe(
            false,
        );
        expect(matchesMore(b, { ...NO_MORE, staff: "st_meera" })).toBe(true);
        expect(
            matchesMore(booking(1, { staff: null }), {
                ...NO_MORE,
                staff: UNASSIGNED,
            }),
        ).toBe(true);
        expect(
            matchesMore(b, { ...NO_MORE, statuses: ["PENDING", "CANCELLED"] }),
        ).toBe(false);
        expect(
            moreCount({ service: "a", staff: null, statuses: ["PENDING"] }),
        ).toBe(2);
    });

    it("offers the services and people there are, by name", () => {
        const choices = moreChoices([
            booking(1),
            booking(2, {
                service: {
                    ...booking(0).service,
                    id: "svc_m",
                    name: "Massage",
                },
                staff: { id: "st_arjun", name: "Arjun" },
            }),
            booking(3, { staff: null }),
        ]);
        expect(choices.services.map((s) => s.label)).toEqual([
            "Massage",
            "Physio assessment",
        ]);
        expect(choices.staff.map((s) => s.label)).toEqual([
            "Arjun",
            "Meera",
            "Nobody yet",
        ]);
    });
});

describe("order and day headings", () => {
    it("reads the past backwards and the rest forwards", () => {
        expect(defaultOrder("outcome")).toBe("latest");
        expect(defaultOrder("upcoming")).toBe("soonest");
        const a = booking(1);
        const b = booking(5);
        expect(ordered([b, a], "soonest").map((x) => x.id)).toEqual([
            a.id,
            b.id,
        ]);
        expect(ordered([a, b], "latest").map((x) => x.id)).toEqual([
            b.id,
            a.id,
        ]);
    });

    it("heads each day: Today, Tomorrow, Yesterday, then the date", () => {
        expect(dayLabel("2026-10-19", "2026-10-19")).toBe("Today · Mon 19 Oct");
        expect(dayLabel("2026-10-20", "2026-10-19")).toBe(
            "Tomorrow · Tue 20 Oct",
        );
        expect(dayLabel("2026-10-18", "2026-10-19")).toBe(
            "Yesterday · Sun 18 Oct",
        );
        expect(dayLabel("2026-10-21", "2026-10-19")).toBe("Wed 21 Oct");
        expect(dayLabel("2027-01-04", "2026-10-19")).toBe("Mon 4 Jan 2027");
    });

    it("puts today's finished bookings under 'Earlier today' when more are to come", () => {
        const rows = ordered(
            [booking(-3), booking(1), booking(20), booking(44)],
            "soonest",
        );
        expect(groupByDay(rows, ZONE, NOW).map((g) => g.label)).toEqual([
            "Earlier today",
            "Today · Mon 19 Oct",
            "Tomorrow · Tue 20 Oct",
            "Wed 21 Oct",
        ]);
        // Only finished ones today: the day is just Today.
        expect(
            groupByDay([booking(-3)], ZONE, NOW).map((g) => g.label),
        ).toEqual(["Today · Mon 19 Oct"]);
    });
});

describe("a row", () => {
    it("says how it stands in one word", () => {
        expect(rowStatus(booking(1), NOW)).toBe("booked");
        expect(rowStatus(booking(1, { status: "PENDING" }), NOW)).toBe(
            "pending",
        );
        expect(rowStatus(booking(-3), NOW)).toBe("unmarked");
        expect(rowStatus(booking(-3, { outcome: "ATTENDED" }), NOW)).toBe(
            "came",
        );
        expect(rowStatus(booking(-3, { outcome: "NO_SHOW" }), NOW)).toBe(
            "didnt",
        );
        expect(rowStatus(booking(1, { status: "CANCELLED" }), NOW)).toBe(
            "cancelled",
        );
        expect(rowStatus(booking(20, { paidWith: "DESK" }), NOW)).toBe(
            "atVisit",
        );
        expect(
            rowStatus(
                booking(20, {
                    paidWith: "DESK",
                    paidAtDesk: { method: "UPI" },
                }),
                NOW,
            ),
        ).toBe("booked");
    });

    const all = { book: true, take: true, people: true };
    const take = { cents: 40000, byLink: false } as DiaryBooking["take"];

    it("offers the boards' menu, in order, for one starting soon", () => {
        expect(rowMenu(booking(0.5, { take }), all, NOW)).toEqual([
            "arrived",
            "take",
            "move",
            "open",
            "person",
            "cancel",
        ]);
    });

    it("leaves out what the booking can't do now", () => {
        // Tomorrow: too early to mark arrived.
        expect(rowMenu(booking(20), all, NOW)).toEqual([
            "move",
            "open",
            "person",
            "cancel",
        ]);
        // Over: nothing to move or cancel.
        expect(rowMenu(booking(-3), all, NOW)).toEqual(["open", "person"]);
        // Cancelled: only to read.
        expect(rowMenu(booking(5, { status: "CANCELLED" }), all, NOW)).toEqual([
            "open",
            "person",
        ]);
        // Walk-in with no contact: no page to open.
        expect(rowMenu(booking(20, { contact: null }), all, NOW)).toEqual([
            "move",
            "open",
            "cancel",
        ]);
    });

    it("leaves out what the viewer can't do", () => {
        // A Member: marks, moves and cancels; takes no money.
        expect(
            rowMenu(
                booking(0.5, { take }),
                { book: true, take: false, people: true },
                NOW,
            ),
        ).toEqual(["arrived", "move", "open", "person", "cancel"]);
        // Read only: the booking itself, and nothing else.
        expect(
            rowMenu(
                booking(0.5, { take }),
                { book: false, take: false, people: false },
                NOW,
            ),
        ).toEqual(["open"]);
    });

    it("names the money and the person", () => {
        expect(takeLabel(booking(1, { take }))).toBe("Take ₹400");
        expect(takeLabel(booking(1))).toBeNull();
        expect(personLabel(booking(1))).toBe("Open Kabir's page");
        expect(
            personLabel(
                booking(1, {
                    contact: {
                        id: "c",
                        firstName: "Dr. Arun",
                        lastName: "Pillai",
                        email: "a@example.com",
                    },
                }),
            ),
        ).toBe("Open Arun's page");
    });
});
