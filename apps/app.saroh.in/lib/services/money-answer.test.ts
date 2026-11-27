import { describe, expect, it } from "vitest";

import { paidWords } from "@/components/bookings/quick-look/quick-look-one";
import type { QuickLookContext } from "@/components/bookings/quick-look/quick-look-types";
import { moneyCell } from "./all-bookings";
import type { DiaryBooking } from "./booking-calendar";
import { payRow } from "./booking-page-money";
import type { BookingPay } from "./money-answer";
import { owes, payLine, payText } from "./money-answer";
import { visitText } from "./peek";
import { classClose, classCloseWords } from "./session-counts";

/**
 * One money answer on a booking (DEC-272): the List's Money column, the
 * quick look and the booking's page say the same word for the same
 * booking, because each only says what the API worked out once.
 */
function booking(pay: BookingPay, over: Partial<DiaryBooking> = {}) {
    return {
        id: "b1",
        serviceId: "s1",
        startAt: "2026-07-30T00:30:00.000Z",
        endAt: "2026-07-30T01:30:00.000Z",
        timezone: "Asia/Kolkata",
        status: "CONFIRMED",
        outcome: "ATTENDED",
        bookerName: "Gurpreet Krishnan",
        bookerEmail: null,
        bookerPhone: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        cancelledAt: null,
        cancelledLate: false,
        service: {
            id: "s1",
            name: "Personal training",
            timezone: "Asia/Kolkata",
            capacity: 1,
            durationMinutes: 60,
            priceCents: 120_000,
            currency: "INR",
        },
        contact: null,
        staff: null,
        paidWith: "DESK",
        packName: null,
        subscriptionId: null,
        paidAtDesk: null,
        take: null,
        pay,
        ...over,
    } as DiaryBooking;
}

const CTX = { money: true } as QuickLookContext;

describe("the same booking says one thing everywhere (DEC-272)", () => {
    const cases: [string, BookingPay, string][] = [
        [
            "paid online",
            { word: "PAID", how: "ONLINE", paidCents: 120_000, dueCents: 0 },
            "Paid online",
        ],
        [
            "marked paid, nothing on paper (the audit's Gurpreet)",
            { word: "PAID", how: null, paidCents: 120_000, dueCents: 0 },
            "Paid",
        ],
        [
            "came, still to pay",
            {
                word: "AWAITING_PAYMENT",
                how: null,
                paidCents: 0,
                dueCents: 120_000,
            },
            "Awaiting payment",
        ],
        [
            "pays at the visit",
            {
                word: "PAYS_AT_VISIT",
                how: null,
                paidCents: 0,
                dueCents: 120_000,
            },
            "Pays at the visit",
        ],
        [
            "a membership",
            { word: "MEMBERSHIP", how: null, paidCents: 0, dueCents: null },
            "Membership",
        ],
    ];
    for (const [name, pay, word] of cases) {
        it(`${name}: List, quick look and page all say "${word}"`, () => {
            const b = booking(pay);
            expect(moneyCell(b).note).toBe(word);
            expect(paidWords(b, CTX, "in")).toContain(word);
            // The page lists payments above its line once paid (online).
            const row = payRow(pay, "INR", pay.how === "ONLINE");
            if (pay.word === "PAID" && pay.how === "ONLINE") {
                expect(row?.text).toBe("Nothing left to take");
            } else {
                expect(row?.text).toContain(word);
            }
        });
    }

    it("never says still to take on a booking that is paid", () => {
        const paid: BookingPay = {
            word: "PAID",
            how: null,
            paidCents: 120_000,
            dueCents: 0,
        };
        expect(payRow(paid, "INR")?.text).not.toMatch(/to take/);
        expect(owes(paid)).toBe(false);
    });

    it("says the amount owed only to who reads money", () => {
        const pay: BookingPay = {
            word: "AWAITING_PAYMENT",
            how: null,
            paidCents: 0,
            dueCents: 120_000,
        };
        expect(payLine(pay, "INR")).toBe("Awaiting payment ₹1,200");
        // A viewer who reads no money is sent the word alone.
        expect(payLine({ word: pay.word, how: null }, "INR")).toBe(
            "Awaiting payment",
        );
        expect(
            paidWords(
                booking({ word: pay.word, how: null }),
                { money: false } as QuickLookContext,
                "in",
            ),
        ).toBe("Awaiting payment");
        expect(payText({ word: "PACK", how: null }, "10 classes")).toBe(
            "Pack · 10 classes",
        );
    });
});

describe("a finished class says who came and who owes (DEC-274)", () => {
    it("counts came, didn't and to pay, leaving cancelled places out", () => {
        const owed: BookingPay = { word: "AWAITING_PAYMENT", how: null };
        const paid: BookingPay = { word: "PAID", how: "ONLINE" };
        const seats = [
            booking(paid),
            booking(paid),
            booking(owed),
            booking(paid, { outcome: "NO_SHOW" }),
            booking(owed, { status: "CANCELLED" }),
        ];
        expect(classClose(seats)).toEqual({
            came: 3,
            didnt: 1,
            toPay: 1,
            unmarked: 0,
        });
        expect(classCloseWords(classClose(seats)).map((w) => w.label)).toEqual([
            "3 came",
            "1 didn't",
            "1 to pay",
        ]);
        expect(
            classCloseWords(classClose([booking(paid, { outcome: null })])).map(
                (w) => w.label,
            ),
        ).toEqual(["Not marked"]);
    });
});

describe("the visit line (DEC-274)", () => {
    it("says a first visit, or which visit and when the last was", () => {
        expect(visitText({ before: 0, lastAt: null }, "Asia/Kolkata")).toBe(
            "First visit",
        );
        expect(
            visitText(
                { before: 3, lastAt: "2026-09-12T05:00:00.000Z" },
                "Asia/Kolkata",
            ),
        ).toBe("4th visit · last 12 Sep");
        expect(
            visitText(
                { before: 10, lastAt: "2026-09-12T05:00:00.000Z" },
                "Asia/Kolkata",
            ),
        ).toMatch(/^11th visit/);
        expect(visitText(null, "Asia/Kolkata")).toBeNull();
    });
});
