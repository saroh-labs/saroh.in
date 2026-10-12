import type { DiaryRow } from "./booking-calendar";
import { diaryBooking, groupDiaries } from "./booking-calendar";

/**
 * The price a booking shows on the diary (12 Oct 2026): money expected, so
 * it is the amount to pay the booking's snapshot froze, GST and all. Never
 * the service's price as typed today, which leaves the GST out where GST is
 * added and moves when the price is edited. Pure.
 */

function row(over: Partial<DiaryRow> = {}): DiaryRow {
    return {
        id: "bk_1",
        serviceId: "svc_1",
        staffId: null,
        startAt: new Date("2026-10-12T04:30:00Z"),
        endAt: new Date("2026-10-12T05:30:00Z"),
        timezone: "Asia/Kolkata",
        status: "CONFIRMED",
        outcome: null,
        bookerName: null,
        bookerEmail: null,
        bookerPhone: null,
        createdAt: new Date("2026-10-10T04:30:00Z"),
        cancelledAt: null,
        cancelledLate: false,
        paidWith: "DESK",
        subscriptionId: null,
        service: {
            id: "svc_1",
            name: "Physio",
            timezone: "Asia/Kolkata",
            capacity: 1,
            durationMinutes: 60,
            // The price as typed.
            priceCents: 100_000,
            currency: "INR",
        },
        contact: null,
        staff: null,
        packRedemption: null,
        ...over,
    } as DiaryRow;
}

/** A booking made at ₹1,000 with 18% GST added: ₹1,180 to pay. */
const ADDED = {
    service: {
        priceCents: 118_000,
        listPriceCents: 100_000,
        gstPriceMode: "ADDED",
        currency: "INR",
    },
};
/** The same price with its GST inside it: ₹1,000 to pay. */
const INCLUDED = {
    service: {
        priceCents: 100_000,
        listPriceCents: 100_000,
        gstPriceMode: "INCLUDED",
        currency: "INR",
    },
};

describe("the price of a booking on the diary", () => {
    it("GST was added: ₹1,180, what the booking was made at", () => {
        expect(diaryBooking(row({ snapshot: ADDED }), true).service).toEqual(
            expect.objectContaining({ priceCents: 118_000, currency: "INR" }),
        );
    });

    it("is the amount the desk takes", () => {
        const booking = diaryBooking(row({ snapshot: ADDED }), true);
        expect(booking.take).toEqual(
            expect.objectContaining({ cents: booking.service.priceCents }),
        );
    });

    it("the price includes GST: ₹1,000, as before", () => {
        expect(
            diaryBooking(row({ snapshot: INCLUDED }), true).service.priceCents,
        ).toBe(100_000);
    });

    it("stays what was agreed when the service's price is edited after", () => {
        const edited = row({ snapshot: ADDED });
        edited.service = { ...edited.service, priceCents: 150_000 };
        expect(diaryBooking(edited, true).service.priceCents).toBe(118_000);
    });

    it("a booking from before snapshots reads the service's price, as before", () => {
        expect(diaryBooking(row(), true).service.priceCents).toBe(100_000);
        expect(
            diaryBooking(row({ snapshot: { service: {} } }), true).service
                .priceCents,
        ).toBe(100_000);
    });

    it("carries no price for a viewer who reads no money", () => {
        const service = diaryBooking(row({ snapshot: ADDED }), false).service;
        expect(service).not.toHaveProperty("priceCents");
        expect(service).not.toHaveProperty("currency");
    });

    it("a class's places are each at what they were booked at", () => {
        const seat = (id: string) =>
            row({
                id,
                snapshot: ADDED,
                service: {
                    id: "svc_1",
                    name: "HIIT",
                    timezone: "Asia/Kolkata",
                    capacity: 10,
                    durationMinutes: 60,
                    priceCents: 100_000,
                    currency: "INR",
                },
            });
        const [diary] = groupDiaries([seat("a"), seat("b")], [], true);
        const session = diary?.classes[0];
        expect(session?.service.priceCents).toBe(118_000);
        expect(session?.bookings.map((b) => b.service.priceCents)).toEqual([
            118_000, 118_000,
        ]);
    });
});
