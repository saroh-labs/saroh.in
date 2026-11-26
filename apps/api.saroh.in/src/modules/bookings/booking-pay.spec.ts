import { diaryBooking } from "./booking-calendar";
import type { PayFacts } from "./booking-money";
import { bookingPay } from "./booking-money";

/**
 * The one money answer for a booking (DEC-272, DEC-273): every surface that
 * says how a booking is paid reads this. Pure.
 */
const NOW = new Date("2026-07-30T12:00:00Z");
const AFTER = new Date("2026-07-30T08:00:00Z"); // the visit has ended
const AHEAD = new Date("2026-07-31T08:00:00Z"); // still to come

const paper = (
    status: string,
    total: number,
    online: number[] = [],
    extra: Partial<PayFacts["paper"][number]> = {},
): PayFacts["paper"][number] => ({
    kind: "INVOICE",
    status,
    total: { toString: () => String(total / 100) },
    paidCents: 0,
    paymentIntents: online.map((amountCents) => ({
        status: "SUCCEEDED",
        amountCents,
    })),
    ...extra,
});

const facts = (over: Partial<PayFacts> = {}): PayFacts => ({
    status: "CONFIRMED",
    outcome: null,
    endAt: AHEAD,
    paidWith: "DESK",
    free: false,
    priceCents: 120_000,
    paper: [],
    ...over,
});

describe("bookingPay: one money answer for a booking (DEC-272)", () => {
    it("paid online in full: Paid, online, nothing to take", () => {
        expect(
            bookingPay(
                facts({
                    paidWith: "PAID",
                    paper: [paper("PAID", 120_000, [120_000])],
                }),
                NOW,
            ),
        ).toEqual({
            word: "PAID",
            how: "ONLINE",
            paidCents: 120_000,
            dueCents: 0,
        });
    });

    it("deposit paid, balance due: Pays at the visit before it, Awaiting payment after", () => {
        const deposit = { paper: [paper("PAID", 40_000, [40_000])] };
        expect(bookingPay(facts(deposit), NOW)).toEqual({
            word: "PAYS_AT_VISIT",
            how: "ONLINE",
            paidCents: 40_000,
            dueCents: 80_000,
        });
        expect(
            bookingPay(
                facts({ ...deposit, endAt: AFTER, outcome: "ATTENDED" }),
                NOW,
            ).word,
        ).toBe("AWAITING_PAYMENT");
    });

    it("pays at the visit, not yet paid: the word changes once the visit ends (DEC-273)", () => {
        expect(bookingPay(facts(), NOW)).toMatchObject({
            word: "PAYS_AT_VISIT",
            dueCents: 120_000,
        });
        // Came, or not marked: money still owed reads Awaiting payment.
        for (const outcome of ["ATTENDED", null]) {
            expect(
                bookingPay(facts({ endAt: AFTER, outcome }), NOW),
            ).toMatchObject({ word: "AWAITING_PAYMENT", dueCents: 120_000 });
        }
        // Didn't come: nothing is owed for the visit.
        expect(
            bookingPay(facts({ endAt: AFTER, outcome: "NO_SHOW" }), NOW).word,
        ).toBe("NOTHING_TO_PAY");
    });

    it("paid at the desk: Paid, at the desk", () => {
        expect(
            bookingPay(
                facts({
                    endAt: AFTER,
                    paper: [
                        paper("PAID", 120_000, [], {
                            paymentMethod: "CASH",
                        } as never),
                    ],
                }),
                NOW,
            ),
        ).toEqual({
            word: "PAID",
            how: "DESK",
            paidCents: 120_000,
            dueCents: 0,
        });
    });

    it("marked paid with nothing on paper is paid, never still to take (the audit's case)", () => {
        expect(
            bookingPay(facts({ paidWith: "PAID", endAt: AFTER }), NOW),
        ).toEqual({ word: "PAID", how: null, paidCents: 120_000, dueCents: 0 });
    });

    it("covered by a pack or a membership: says so, no amount", () => {
        for (const paidWith of ["PACK", "MEMBERSHIP"]) {
            expect(bookingPay(facts({ paidWith, endAt: AFTER }), NOW)).toEqual({
                word: paidWith,
                how: null,
                paidCents: 0,
                dueCents: null,
            });
        }
    });

    it("a treatment's visit and a course's session are paid elsewhere", () => {
        expect(bookingPay(facts({ orderId: "o1" }), NOW).word).toBe("ON_ORDER");
        expect(bookingPay(facts({ courseEnrollmentId: "c1" }), NOW).word).toBe(
            "WITH_COURSE",
        );
    });

    it("cancelled: what it had paid (refunded or not), else nothing", () => {
        expect(
            bookingPay(
                facts({
                    status: "CANCELLED",
                    paidWith: "PAID",
                    paper: [
                        paper("CREDITED", 120_000, [120_000], {
                            paidCents: 120_000,
                        }),
                    ],
                }),
                NOW,
            ),
        ).toEqual({
            word: "PAID",
            how: "ONLINE",
            paidCents: 120_000,
            dueCents: null,
        });
        expect(bookingPay(facts({ status: "CANCELLED" }), NOW)).toEqual({
            word: "NOTHING_TO_PAY",
            how: null,
            paidCents: 0,
            dueCents: null,
        });
    });

    it("free (DEC-261): Free, nothing owed, before or after the visit", () => {
        for (const endAt of [AHEAD, AFTER]) {
            expect(
                bookingPay(
                    facts({ free: true, paidWith: null, priceCents: 0, endAt }),
                    NOW,
                ),
            ).toEqual({ word: "FREE", how: null, paidCents: 0, dueCents: 0 });
        }
    });

    it("a pay link out or a hold waiting on the customer: Awaiting payment", () => {
        expect(
            bookingPay(
                facts({ paidWith: null, paper: [paper("ISSUED", 120_000)] }),
                NOW,
            ),
        ).toMatchObject({
            word: "AWAITING_PAYMENT",
            how: "LINK",
            dueCents: 120_000,
        });
        expect(
            bookingPay(facts({ status: "PENDING", paidWith: null }), NOW).word,
        ).toBe("AWAITING_PAYMENT");
    });

    it("no price: nothing to say", () => {
        expect(bookingPay(facts({ priceCents: null }), NOW).word).toBeNull();
    });
});

describe("the diary sends the answer, amounts only to who reads money (DEC-098)", () => {
    const row = {
        id: "b1",
        serviceId: "s1",
        startAt: new Date("2026-07-30T06:00:00Z"),
        endAt: AFTER,
        timezone: "Asia/Kolkata",
        status: "CONFIRMED",
        outcome: "ATTENDED",
        bookerName: null,
        bookerEmail: null,
        bookerPhone: null,
        createdAt: new Date("2026-07-01T00:00:00Z"),
        cancelledAt: null,
        cancelledLate: false,
        paidWith: "DESK",
        subscriptionId: null,
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
        packRedemption: null,
        snapshot: { service: { priceCents: 120_000, currency: "INR" } },
        invoices: [],
    };

    it("came and unpaid reads Awaiting payment, with the amount for money only", () => {
        expect(diaryBooking(row, true, NOW).pay).toEqual({
            word: "AWAITING_PAYMENT",
            how: null,
            paidCents: 0,
            dueCents: 120_000,
        });
        expect(diaryBooking(row, false, NOW).pay).toEqual({
            word: "AWAITING_PAYMENT",
            how: null,
        });
    });
});
