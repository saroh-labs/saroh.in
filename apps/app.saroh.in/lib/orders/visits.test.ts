import { describe, expect, it } from "vitest";

import { eventText } from "./lifecycle";
import type { OrderReadEvent, OrderVisit, OrderVisits } from "./read";
import { orderTimelineSteps } from "./timeline-steps";
import {
    attendedToast,
    isAppointment,
    quickVisitsText,
    visitMeta,
    visitsHow,
    visitsNextLabel,
    visitsNextNote,
    visitsStanding,
    visitsSummary,
    visitStepLabel,
    visitWhen,
} from "./visits";

/*
 * B14's words for a treatment's visits, after "Saroh Order Detail"
 * (`?id=D301`): Rahul's root canal, visit 1 attended on 12 Sep, visit 2
 * booked on 18 Sep at 10:00, visit 3 still to book. The design's "now" is
 * 18 Sep, 10:40 at the clinic (UTC here, so the clock reads as written).
 */

const zone = "UTC";
const now = new Date("2026-09-18T10:40:00Z");

const visit = (over: Partial<OrderVisit> & { number: number }): OrderVisit => ({
    bookingId: `bk_${over.number}`,
    startAt: null,
    endAt: null,
    staffName: "Dr. Meenakshi Rao",
    where: "IN_PERSON",
    state: "TO_BOOK",
    attendedAt: null,
    attendedBy: null,
    ...over,
});

function d301(over: Partial<OrderVisits> = {}): OrderVisits {
    return {
        total: 3,
        attended: 1,
        booked: 2,
        service: {
            id: "svc",
            name: "Root canal treatment",
            durationMinutes: 60,
            timezone: zone,
            priceCents: 1_200_000,
        },
        visits: [
            visit({
                number: 1,
                state: "ATTENDED",
                startAt: "2026-09-12T10:00:00Z",
                attendedAt: "2026-09-12T11:02:00Z",
                attendedBy: { id: "u1", name: "Meera Iyer" },
            }),
            visit({
                number: 2,
                state: "BOOKED",
                startAt: "2026-09-18T10:00:00Z",
            }),
            visit({ number: 3, bookingId: null, staffName: null }),
        ],
        next: { attend: 2, upcoming: null, book: null },
        done: false,
        closed: false,
        ...over,
    };
}

describe("the Visits card's words (B14)", () => {
    it("knows an appointment by its type", () => {
        expect(isAppointment({ fulfilmentType: "APPOINTMENT_ONLINE" })).toBe(
            true,
        );
        expect(isAppointment({ fulfilmentType: "PICKUP" })).toBe(false);
    });

    it("sums up as the design does", () => {
        expect(visitsSummary(d301())).toBe("1 of 3 attended");
    });

    it("says each visit's when, who and where", () => {
        const [one, two, three] = d301().visits;
        expect(visitWhen(one, zone, now)).toBe("12 Sep, 10:00");
        expect(visitWhen(two, zone, now)).toBe("Today, 10:00");
        expect(visitWhen(three, zone, now)).toBe("Not booked yet");
        expect(visitMeta(two, "Rahul")).toBe("Dr. Meenakshi Rao · In person");
        expect(visitMeta({ ...two, where: "ONLINE" }, "Rahul")).toBe(
            "Dr. Meenakshi Rao · Video call",
        );
        expect(visitMeta(three, "Rahul")).toBe("Book it when Rahul is ready");
    });

    it("labels the stepper by day, with the time only today", () => {
        const [one, two, three] = d301().visits;
        expect(visitStepLabel(one, zone, now)).toBe("Visit 1 · 12 Sep");
        expect(visitStepLabel(two, zone, now)).toBe("Visit 2 · Today, 10:00");
        expect(visitStepLabel(three, zone, now)).toBe("Visit 3");
    });

    it("offers Mark visit N attended once it has started", () => {
        const v = d301();
        expect(visitsNextLabel(v)).toBe("Mark visit 2 attended");
        expect(visitsNextNote(v, zone, now)).toBe(
            "Marks the visit done. After the last visit the order is complete.",
        );
    });

    it("before it starts, says when, and offers nothing", () => {
        const v = d301({
            next: {
                attend: null,
                upcoming: { number: 2, startAt: "2026-09-19T12:30:00Z" },
                book: null,
            },
        });
        expect(visitsNextLabel(v)).toBeNull();
        expect(visitsNextNote(v, zone, now)).toBe(
            "Next visit 19 Sep, 12:30. You can mark it attended once it starts.",
        );
    });

    it("offers Book visit N when no booked visit waits", () => {
        const v = d301({ next: { attend: null, upcoming: null, book: 3 } });
        expect(visitsNextLabel(v)).toBe("Book visit 3");
        expect(visitsNextNote(v, zone, now)).toBe(
            "Opens the diary to book the next visit.",
        );
    });

    it("a closed treatment has no note", () => {
        expect(visitsNextNote(d301({ closed: true }), zone, now)).toBeNull();
    });

    it("the heading says the type and the next visit", () => {
        expect(visitsHow("Booking, in person", d301(), zone, now)).toBe(
            "Booking, in person · next visit today, 10:00",
        );
        expect(visitsHow("Booking, online", null, zone, now)).toBe(
            "Booking, online",
        );
    });

    it("the status beside the number: Booked, Attended, Refunded, Cancelled", () => {
        expect(visitsStanding(d301(), false, false).label).toBe("Booked");
        expect(visitsStanding(d301({ done: true }), false, false)).toEqual({
            label: "Attended",
            tone: "success",
        });
        expect(visitsStanding(d301(), true, false).label).toBe("Refunded");
        expect(visitsStanding(d301(), false, true).label).toBe("Cancelled");
    });

    it("the quick view says 1 of 3 visits and the next one", () => {
        const booked = d301({
            visits: d301().visits.map((v) =>
                v.number === 2 ? { ...v, startAt: "2026-09-19T12:30:00Z" } : v,
            ),
        });
        expect(quickVisitsText(booked, zone, now)).toBe(
            "1 of 3 visits · Visit 2 · booked 19 Sep",
        );
        expect(quickVisitsText(d301(), zone, now)).toBe(
            "1 of 3 visits · Visit 2 · booked today",
        );
        const toBook = d301({
            visits: d301().visits.map((v) =>
                v.number === 2 ? { ...v, state: "ATTENDED" as const } : v,
            ),
            attended: 2,
        });
        expect(quickVisitsText(toBook, zone, now)).toBe(
            "2 of 3 visits · Visit 3 · to book",
        );
    });

    it("the toast says when the last one completes it", () => {
        expect(attendedToast(2, false)).toBe("Visit 2 marked attended.");
        expect(attendedToast(3, true)).toBe(
            "Visit 3 marked attended. All visits done.",
        );
    });
});

describe("the timeline of a treatment (B14)", () => {
    const ev = (over: Partial<OrderReadEvent>): OrderReadEvent => ({
        id: "ev",
        kind: "STATUS",
        at: "2026-09-25T10:00:00Z",
        actor: null,
        fromStage: "NEW",
        toStage: "DELIVERED",
        fromStatus: "PENDING",
        toStatus: "DELIVERED",
        note: null,
        undoneAt: null,
        undoesEventId: null,
        ...over,
    });

    it("the step that fulfils it reads as its note", () => {
        expect(
            eventText(ev({ note: "All 3 visits attended" }), () => null),
        ).toBe("All 3 visits attended");
        // A bare status step still reads as before.
        expect(eventText(ev({}), () => null)).toBe("Marked delivered");
    });

    it("each visit marked attended is a line, newest first", () => {
        const steps = orderTimelineSteps(
            {
                events: [],
                visits: d301(),
                placedOnline: false,
                placedAt: "2026-09-10T09:00:00Z",
                store: { id: "s", name: "Indiranagar clinic" },
                customer: null,
            } as unknown as Parameters<typeof orderTimelineSteps>[0],
            null,
            "INR",
            (n) => (n ?? "").split(" ")[0] || "the customer",
        );
        expect(steps.map((s) => [s.what, s.who])).toEqual([
            ["Visit 1 attended", "Meera"],
            ["Placed at Indiranagar clinic", null],
        ]);
    });
});
