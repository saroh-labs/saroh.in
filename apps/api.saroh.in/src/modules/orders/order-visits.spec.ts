import type { NextVisitBooking, RawOrderVisits } from "./order-visits";
import { nextVisitOf, orderVisitsOf, visitActorIds } from "./order-visits";

/*
 * B14's Visits card read, pure: each visit's state, who marked it, and what
 * the header offers next — "Mark visit N attended" only once it has
 * started, "Book visit N" when no booked visit waits.
 */

const now = new Date("2026-09-18T10:40:00Z");
const at = (iso: string) => new Date(iso);

type Booking = RawOrderVisits["bookings"][number];

function booking(n: number, over: Partial<Booking> = {}): Booking {
    const start = over.startAt ?? at(`2026-09-1${n}T10:00:00Z`);
    return {
        id: `bk_${n}`,
        visitNumber: n,
        startAt: start,
        endAt: new Date(start.getTime() + 60 * 60_000),
        outcome: null,
        locationType: null,
        staff: { name: "Dr. Meenakshi Rao" },
        events: [],
        ...over,
    };
}

function raw(
    bookings: Booking[],
    over: Partial<Omit<RawOrderVisits, "bookings">> = {},
): RawOrderVisits {
    return {
        status: "PENDING",
        paymentStatus: "PAID",
        items: [
            {
                service: {
                    id: "svc_rct",
                    name: "Root canal treatment",
                    visits: 3,
                    durationMinutes: 60,
                    timezone: "Asia/Kolkata",
                    priceCents: 1_200_000,
                    locationType: "IN_PERSON",
                },
            },
        ],
        bookings,
        ...over,
    };
}

const attendedBy = (userId: string, when: string) => ({
    outcome: "ATTENDED",
    events: [{ createdAt: at(when), actorUserId: userId }],
});

describe("orderVisitsOf (B14)", () => {
    it("is null for an order that isn't a treatment", () => {
        expect(orderVisitsOf({ ...raw([]), items: [] }, now)).toBeNull();
    });

    it("visit 1 attended, visit 2 booked later: 1 of 3, and visit 2 waits for its start", () => {
        const read = orderVisitsOf(
            raw([
                booking(1, attendedBy("u_owner", "2026-09-11T10:30:00Z")),
                booking(2, { startAt: at("2026-09-19T12:30:00Z") }),
            ]),
            now,
            new Map([["u_owner", "Meera Iyer"]]),
        );
        expect(read).not.toBeNull();
        expect(read?.total).toBe(3);
        expect(read?.attended).toBe(1);
        expect(read?.booked).toBe(2);
        expect(read?.visits.map((v) => v.state)).toEqual([
            "ATTENDED",
            "BOOKED",
            "TO_BOOK",
        ]);
        expect(read?.visits[0].attendedBy).toEqual({
            id: "u_owner",
            name: "Meera Iyer",
        });
        expect(read?.visits[0].attendedAt).toEqual(at("2026-09-11T10:30:00Z"));
        expect(read?.visits[2]).toMatchObject({
            bookingId: null,
            startAt: null,
            staffName: null,
        });
        // Not started: nothing to mark or book yet; the note names when.
        expect(read?.next).toEqual({
            attend: null,
            upcoming: { number: 2, startAt: at("2026-09-19T12:30:00Z") },
            book: null,
        });
        expect(read?.done).toBe(false);
    });

    it("offers Mark visit N attended once the booked visit has started", () => {
        const read = orderVisitsOf(
            raw([
                booking(1, { outcome: "ATTENDED" }),
                booking(2, { startAt: at("2026-09-18T10:40:00Z") }),
            ]),
            now,
        );
        expect(read?.next).toEqual({ attend: 2, upcoming: null, book: null });
    });

    it("offers Book visit N when no booked visit waits", () => {
        const read = orderVisitsOf(
            raw([
                booking(1, { outcome: "ATTENDED" }),
                booking(2, { outcome: "ATTENDED" }),
            ]),
            now,
        );
        expect(read?.next).toEqual({ attend: null, upcoming: null, book: 3 });
    });

    it("every visit attended: done, with nothing next", () => {
        const read = orderVisitsOf(
            raw([1, 2, 3].map((n) => booking(n, { outcome: "ATTENDED" }))),
            now,
        );
        expect(read?.done).toBe(true);
        expect(read?.attended).toBe(3);
        expect(read?.next).toEqual({
            attend: null,
            upcoming: null,
            book: null,
        });
    });

    it("a no-show reads as Missed and the next visit is to book", () => {
        const read = orderVisitsOf(
            raw([booking(1, { outcome: "NO_SHOW" })]),
            now,
        );
        expect(read?.visits[0].state).toBe("MISSED");
        expect(read?.next.book).toBe(2);
    });

    it("a cancelled or refunded order offers nothing next", () => {
        for (const over of [
            { status: "CANCELLED" },
            { paymentStatus: "REFUNDED" },
        ]) {
            const read = orderVisitsOf(
                raw(
                    [booking(1, { startAt: at("2026-09-18T09:00:00Z") })],
                    over,
                ),
                now,
            );
            expect(read?.closed).toBe(true);
            expect(read?.next).toEqual({
                attend: null,
                upcoming: null,
                book: null,
            });
        }
    });

    it("a video call reads as online, from the booking, else from the service", () => {
        const booked = orderVisitsOf(
            raw([booking(1, { locationType: "ONLINE" })]),
            now,
        );
        expect(booked?.visits.map((v) => v.where)).toEqual([
            "ONLINE",
            "IN_PERSON",
            "IN_PERSON",
        ]);
        const online = raw([]);
        const svc = online.items[0].service;
        if (svc) svc.locationType = "ONLINE";
        expect(orderVisitsOf(online, now)?.visits[0].where).toBe("ONLINE");
    });

    it("a visit booked past the service's count (edited down) still shows", () => {
        const edited = raw([booking(1), booking(2), booking(3), booking(4)]);
        expect(orderVisitsOf(edited, now)?.total).toBe(4);
    });

    it("names who marked visits attended, once each", () => {
        expect(
            visitActorIds(
                raw([
                    booking(1, attendedBy("u_1", "2026-09-11T10:00:00Z")),
                    booking(2, attendedBy("u_1", "2026-09-12T10:00:00Z")),
                    booking(3, attendedBy("u_2", "2026-09-13T10:00:00Z")),
                ]),
            ),
        ).toEqual(["u_1", "u_2"]);
    });
});

describe("nextVisitOf — the Orders row's Next (B14, DEC-067)", () => {
    const b = (
        n: number,
        iso: string,
        outcome: string | null = null,
    ): NextVisitBooking => ({
        orderId: "o1",
        visitNumber: n,
        startAt: at(iso),
        outcome,
        service: { timezone: "Asia/Kolkata" },
    });

    it("is the first visit by number still waiting", () => {
        expect(
            nextVisitOf([
                b(1, "2026-09-10T10:00:00Z", "ATTENDED"),
                b(2, "2026-09-19T10:00:00Z"),
                b(3, "2026-09-26T10:00:00Z"),
            ]),
        ).toEqual({
            startAt: at("2026-09-19T10:00:00Z"),
            timezone: "Asia/Kolkata",
        });
    });

    it("skips a missed visit, and counts a visit's first booking only", () => {
        expect(
            nextVisitOf([
                b(1, "2026-09-10T10:00:00Z", "NO_SHOW"),
                b(1, "2026-09-12T10:00:00Z"),
                b(2, "2026-09-20T10:00:00Z"),
            ])?.startAt,
        ).toEqual(at("2026-09-20T10:00:00Z"));
    });

    it("is null with nothing booked, or every visit attended", () => {
        expect(nextVisitOf([])).toBeNull();
        expect(
            nextVisitOf([b(1, "2026-09-10T10:00:00Z", "ATTENDED")]),
        ).toBeNull();
    });
});
