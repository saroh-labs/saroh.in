import { describe, expect, it } from "vitest";

import type {
    BookingPayment,
    BookingPaymentView,
    OnlineBlocker,
} from "@/lib/staff/types";

import { onlineBookingProblem } from "./online-booking";
import type { DepositMode } from "./service";

const view = (
    bookingPayment: BookingPayment,
    onlineBlocker: OnlineBlocker | null = null,
): BookingPaymentView => ({ bookingPayment, onlineBlocker });

const svc = (depositMode: DepositMode, priceCents: number | null = 80_000) => ({
    priceCents,
    depositMode,
});

describe("what happens when a service is booked online (DEC-088, DEC-089, #821)", () => {
    it("Both with a provider: every service can", () => {
        for (const mode of [
            "NONE",
            "PERCENT_25",
            "PERCENT_50",
            "FULL",
        ] as const) {
            expect(onlineBookingProblem(svc(mode), view("BOTH"))).toBeNull();
        }
    });

    it("Both, a deposit with no provider: paid at the desk for now, linking to Settings › Providers (DEC-089)", () => {
        const problem = onlineBookingProblem(
            svc("PERCENT_50"),
            view("BOTH", "NO_PROVIDER"),
        );
        expect(problem).toEqual({
            blocked: false,
            text: "Paid at the desk for now: no payment provider is connected, so nothing is taken when people book.",
            line: "Paid at the desk for now: no payment provider is connected, so nothing is taken when people book.",
            fix: {
                href: "/settings/providers",
                label: "Connect one in Settings › Providers",
            },
        });
    });

    it("Both, a deposit with Payments switched off: paid at the desk, the fix is turning Payments on", () => {
        expect(
            onlineBookingProblem(
                svc("PERCENT_25"),
                view("BOTH", "PAYMENTS_OFF"),
            ),
        ).toMatchObject({
            blocked: false,
            text: "Paid at the desk for now: Payments is switched off, so nothing is taken when people book.",
            fix: { href: "/settings/modules", label: "Turn on Payments" },
        });
    });

    it("a deposit when the business takes payment at the desk only: paid at the desk, the fix is the booking rule", () => {
        for (const blocker of [null, "NO_PROVIDER"] as const) {
            expect(
                onlineBookingProblem(svc("PERCENT_50"), view("DESK", blocker)),
            ).toEqual({
                blocked: false,
                text: "Paid at the desk: your booking rules take payment at the desk only, so nothing is taken when people book.",
                line: "Paid at the desk: your booking rules take payment at the desk only, so nothing is taken when people book.",
                fix: {
                    href: "/bookings/availability",
                    label: "Change it in Booking rules",
                },
            });
        }
    });

    it("online only, a deposit with no provider: can't be booked online", () => {
        expect(
            onlineBookingProblem(svc("FULL"), view("ONLINE", "NO_PROVIDER")),
        ).toEqual({
            blocked: true,
            text: "People can't book this online: it takes payment when they book, and no payment provider is connected.",
            line: "Can't be booked online: it takes payment when they book, and no payment provider is connected.",
            fix: {
                href: "/settings/providers",
                label: "Connect one in Settings › Providers",
            },
        });
        expect(
            onlineBookingProblem(
                svc("PERCENT_50"),
                view("ONLINE", "PAYMENTS_OFF"),
            ),
        ).toMatchObject({ blocked: true });
        expect(
            onlineBookingProblem(svc("PERCENT_50"), view("ONLINE")),
        ).toBeNull();
    });

    it("nothing at booking: fine at the desk, and with Both even with no provider", () => {
        expect(
            onlineBookingProblem(svc("NONE"), view("DESK", "NO_PROVIDER")),
        ).toBeNull();
        expect(
            onlineBookingProblem(svc("NONE"), view("BOTH", "NO_PROVIDER")),
        ).toBeNull();
    });

    it("online only with no provider: no priced service can be booked", () => {
        expect(
            onlineBookingProblem(svc("NONE"), view("ONLINE", "NO_PROVIDER")),
        ).toMatchObject({
            blocked: true,
            text: "People can't book this online: your booking rules take payment online only, and no payment provider is connected.",
        });
        expect(onlineBookingProblem(svc("NONE"), view("ONLINE"))).toBeNull();
    });

    it("no price, or couldn't tell: says nothing", () => {
        expect(
            onlineBookingProblem(
                svc("PERCENT_50", null),
                view("DESK", "NO_PROVIDER"),
            ),
        ).toBeNull();
        expect(
            onlineBookingProblem(svc("NONE", 0), view("ONLINE", "NO_PROVIDER")),
        ).toBeNull();
        expect(onlineBookingProblem(svc("PERCENT_50"), null)).toBeNull();
    });

    it("on a plan without online payments: names the plan and links to Plans", () => {
        expect(
            onlineBookingProblem(svc("PERCENT_50"), view("ONLINE", "PLAN")),
        ).toMatchObject({
            line: "Can't be booked online: it takes payment when they book, and your plan doesn't take payment online.",
            fix: { href: "/settings/billing#change-plan", label: "See plans" },
        });
    });
});
