import type { BookingPageData } from "@saroh/site-blocks";
import { describe, expect, it } from "vitest";

import type { BookingPageLookup } from "./booking-page";
import { headerAction } from "./header-action";

const PAGE: BookingPageData = {
    businessName: "Pulse Fitness",
    open: true,
    timezone: "Asia/Kolkata",
    payOnline: false,
    rules: {
        bookAheadDays: 21,
        latestBookingMinutes: 120,
        freeCancelHours: 12,
    },
    services: [
        {
            id: "svc_pt",
            name: "Personal training",
            description: null,
            durationMinutes: 60,
            kind: "one",
            capacity: 1,
            priceCents: 120_000,
            currency: "INR",
            online: false,
            staff: ["Karan Mehta"],
        },
    ],
};

const booking = (page: Partial<BookingPageData>): BookingPageLookup => ({
    ok: true,
    page: { ...PAGE, ...page },
});

describe("the site header's main button (G17)", () => {
    it("is Book, to /book, when the business takes bookings here", () => {
        expect(
            headerAction({ booking: booking({}), shopServes: false }),
        ).toEqual({ label: "Book", href: "/book" });
    });

    it("is Book even when a shop also serves: booking comes first", () => {
        expect(
            headerAction({ booking: booking({}), shopServes: true }),
        ).toEqual({ label: "Book", href: "/book" });
    });

    it("is none for a site with no modules", () => {
        expect(
            headerAction({
                booking: booking({ open: false, services: [] }),
                shopServes: false,
            }),
        ).toBeNull();
    });

    it("is none when Appointments is off", () => {
        expect(
            headerAction({
                booking: booking({ open: false }),
                shopServes: false,
            }),
        ).toBeNull();
    });

    it("is none when Appointments is on with nothing to book", () => {
        expect(
            headerAction({
                booking: booking({ services: [] }),
                shopServes: false,
            }),
        ).toBeNull();
    });

    it("is none for a Commerce-only site before /shop serves (G11)", () => {
        expect(
            headerAction({
                booking: booking({ open: false, services: [] }),
                shopServes: false,
            }),
        ).toBeNull();
    });

    it("is Order, to /shop, once /shop serves for the site", () => {
        expect(
            headerAction({
                booking: booking({ open: false, services: [] }),
                shopServes: true,
            }),
        ).toEqual({ label: "Order", href: "/shop" });
    });

    it("is none when the booking read failed or there is no site id", () => {
        for (const lookup of [
            { ok: false, reason: "unavailable" },
            { ok: false, reason: "missing" },
            null,
        ] as const) {
            expect(
                headerAction({ booking: lookup, shopServes: false }),
            ).toBeNull();
        }
    });
});
