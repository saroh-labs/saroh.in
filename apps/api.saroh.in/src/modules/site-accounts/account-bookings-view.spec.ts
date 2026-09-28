import {
    bookingRowView,
    cancelResultView,
    treatmentView,
} from "./customer-view";

/**
 * A6's half of the account's allow-list (ADR-011): each serializer is fed a
 * row carrying what a customer must never see — a staff note, the intake
 * note, another attendee, the booker fields staff typed, payment references,
 * internal ids — and none of it may come out. And the words it decides:
 * a booking's state, "Visit N of M", and which visit a treatment offers.
 */

const SECRETS = [
    "STAFF NOTE: nervous patient",
    "other.attendee@example.in",
    "Other Attendee",
    "pay_ref_123",
    "org_secret_id",
    "contact_secret_id",
    "user_staff_id",
];

function leaks(value: unknown): string[] {
    const text = JSON.stringify(value);
    return SECRETS.filter((secret) => text.includes(secret));
}

const noisy = {
    organizationId: "org_secret_id",
    contactId: "contact_secret_id",
    actorUserId: "user_staff_id",
    intakeNote: "STAFF NOTE: nervous patient",
    bookerEmail: "other.attendee@example.in",
    bookerName: "Other Attendee",
    providerRef: "pay_ref_123",
};

const NOW = new Date("2026-10-01T06:00:00Z");

function row(over: Record<string, unknown> = {}) {
    return {
        id: "bk_1",
        startAt: new Date("2026-10-05T04:30:00Z"),
        endAt: new Date("2026-10-05T05:30:00Z"),
        timezone: "Asia/Kolkata",
        status: "CONFIRMED",
        outcome: null,
        locationType: "IN_PERSON",
        cancelledLate: false,
        visitNumber: null,
        service: { id: "svc_1", name: "Check-up", capacity: 1, visits: 1 },
        staff: { name: "Dr. Rao" },
        ...noisy,
        ...over,
    } as never;
}

describe("a booking row in the account (A6)", () => {
    it("names the service, the time and who it is with — nobody else", () => {
        const view = bookingRowView(row(), {
            move: "sheet",
            cancel: {
                late: false,
                freeUntil: "2026-10-04T04:30:00.000Z",
                money: "refund",
                credit: null,
            },
        });
        expect(view).toEqual({
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
            visit: null,
            cancelledLate: false,
            move: "sheet",
            cancel: {
                late: false,
                freeUntil: "2026-10-04T04:30:00.000Z",
                money: "refund",
                credit: null,
            },
        });
        expect(leaks(view)).toEqual([]);
    });

    it("says how it went, a class from a one-to-one, and a treatment's visit as N of M", () => {
        expect(bookingRowView(row({ outcome: "ATTENDED" })).state).toBe(
            "attended",
        );
        expect(bookingRowView(row({ outcome: "NO_SHOW" })).state).toBe(
            "missed",
        );
        const late = bookingRowView(
            row({ status: "CANCELLED", cancelledLate: true }),
        );
        expect(late).toMatchObject({ state: "cancelled", cancelledLate: true });
        // Only a cancelled booking is "cancelled late".
        expect(bookingRowView(row({ cancelledLate: true })).cancelledLate).toBe(
            false,
        );
        expect(
            bookingRowView(
                row({
                    service: {
                        id: "svc_2",
                        name: "Yoga",
                        capacity: 12,
                        visits: 1,
                    },
                }),
            ).kind,
        ).toBe("class");
        expect(
            bookingRowView(
                row({
                    visitNumber: 2,
                    service: {
                        id: "svc_3",
                        name: "Root canal",
                        capacity: 1,
                        visits: 3,
                    },
                }),
            ).visit,
        ).toEqual({ number: 2, of: 3 });
        // With no actions, nothing can be done with it.
        expect(bookingRowView(row())).toMatchObject({
            move: null,
            cancel: null,
        });
    });

    it("a cancel's answer says the money in the customer's terms, and no payment reference", () => {
        const view = cancelResultView(bookingRowView(row()), {
            refund: {
                amountCents: 40_050,
                currency: "INR",
                status: "CONFIRMING",
            },
            kept: null,
            ...({ providerRef: "pay_ref_123" } as object),
        });
        expect(view).toMatchObject({
            refund: { amount: "400.50", currency: "INR", status: "CONFIRMING" },
            kept: null,
            order: false,
        });
        expect(leaks(view)).toEqual([]);
        expect(
            cancelResultView(bookingRowView(row()), {
                refund: null,
                kept: null,
                treatmentOrderId: "ord_1",
            }).order,
        ).toBe(true);
    });
});

describe("a treatment in the account (A6, E9)", () => {
    const visit = (n: number, over: Record<string, unknown> = {}) => ({
        id: `bk_${n}`,
        visitNumber: n,
        startAt: new Date(`2026-09-${10 + n}T04:30:00Z`),
        timezone: "Asia/Kolkata",
        status: "CONFIRMED",
        outcome: "ATTENDED",
        locationType: "IN_PERSON",
        staff: { name: "Dr. Rao" },
        ...noisy,
        ...over,
    });
    const order = (bookings: ReturnType<typeof visit>[], over = {}) => ({
        id: "ord_1",
        total: "9000",
        currency: "INR",
        status: "OPEN",
        paymentStatus: "PAID",
        service: { name: "Root canal", visits: 3 },
        bookings,
        ...noisy,
        ...over,
    });

    it("lists every visit — done, booked, still to book — and offers the next once none is waiting", () => {
        const view = treatmentView(order([visit(1)]), NOW);
        expect(view).toMatchObject({
            ref: "ord_1",
            name: "Root canal",
            total: "9000.00",
            paid: true,
            done: 1,
            bookNext: 2,
        });
        expect(view.visits.map((v) => v.state)).toEqual([
            "done",
            "to-book",
            "to-book",
        ]);
        expect(leaks(view)).toEqual([]);

        // Visit 2 booked and still to come: nothing more to book yet.
        const waiting = treatmentView(
            order([
                visit(1),
                visit(2, {
                    startAt: new Date("2026-10-08T04:30:00Z"),
                    outcome: null,
                }),
            ]),
            NOW,
        );
        expect(waiting.visits[1]).toMatchObject({
            state: "booked",
            ref: "bk_2",
            staff: "Dr. Rao",
        });
        expect(waiting.bookNext).toBeNull();
    });

    it("a cancelled visit frees its number; a refunded or cancelled order offers nothing", () => {
        const freed = treatmentView(
            order([visit(1), visit(2, { status: "CANCELLED", outcome: null })]),
            NOW,
        );
        expect(freed.visits[1]).toMatchObject({ state: "to-book", ref: null });
        expect(freed.bookNext).toBe(2);
        expect(
            treatmentView(order([visit(1)], { paymentStatus: "REFUNDED" }), NOW)
                .bookNext,
        ).toBeNull();
        expect(
            treatmentView(order([visit(1)], { status: "CANCELLED" }), NOW)
                .bookNext,
        ).toBeNull();
        // Every visit done: nothing left to book.
        expect(
            treatmentView(order([visit(1), visit(2), visit(3)]), NOW).bookNext,
        ).toBeNull();
    });
});
