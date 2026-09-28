import { describe, expect, it } from "vitest";

import type { BookingMoney } from "./booking-money";
import {
    cancelledMessage,
    cancelPlan,
    canRefundPayments,
    deadlineText,
    paidLine,
    refundLine,
} from "./booking-money";

const money = (over: Partial<BookingMoney> = {}): BookingMoney => ({
    priceCents: 80_000,
    currency: "INR",
    paidOnlineCents: 40_000,
    deposit: true,
    dueCents: 40_000,
    refund: null,
    ...over,
});

const DEADLINE = "2026-09-19T04:30:00.000Z"; // 10:00 in Kolkata
const ZONE = "Asia/Kolkata";

describe("paidLine (E8)", () => {
    it("says a deposit was paid and what is due at the visit", () => {
        expect(paidLine(money())).toBe(
            "Deposit ₹400 paid · ₹400 due at the visit",
        );
    });

    it("paid in full online, due at the desk, or nothing to say", () => {
        expect(
            paidLine(
                money({ deposit: false, paidOnlineCents: 80_000, dueCents: 0 }),
            ),
        ).toBe("₹800 paid online");
        expect(
            paidLine(
                money({ deposit: false, paidOnlineCents: 0, dueCents: 80_000 }),
            ),
        ).toBe("₹800 due at the visit");
        expect(
            paidLine(
                money({ deposit: false, paidOnlineCents: 0, dueCents: null }),
            ),
        ).toBeNull();
    });
});

describe("refundLine (DEC-026)", () => {
    it("names each state the provider can be in", () => {
        const r = (
            status: "PENDING" | "SUCCEEDED" | "FAILED",
            beingConfirmed = false,
        ) =>
            refundLine(
                money({
                    refund: { amountCents: 40_000, status, beingConfirmed },
                }),
            );
        expect(r("SUCCEEDED")).toBe("₹400 refunded.");
        expect(r("PENDING")).toBe(
            "Refund of ₹400 sent. The payment provider is confirming it.",
        );
        expect(r("PENDING", true)).toBe(
            "Refund of ₹400 is being confirmed with the payment provider.",
        );
        expect(r("FAILED")).toMatch(/^The refund of ₹400 didn't go through/);
        expect(refundLine(money())).toBeNull();
    });
});

describe("cancelPlan (DEC-051)", () => {
    const before = new Date("2026-09-19T03:00:00.000Z").getTime();
    const after = new Date("2026-09-19T06:00:00.000Z").getTime();

    it("before the deadline fixed at booking: the deposit is refunded", () => {
        expect(
            cancelPlan({
                money: money(),
                freeCancelUntil: DEADLINE,
                timezone: ZONE,
                now: before,
                canRefund: false,
            }),
        ).toEqual({
            late: false,
            amount: "₹400",
            what: "deposit",
            canOverride: false,
            body: "It's before the free-cancel time, so the ₹400 deposit is refunded to them.",
        });
    });

    it("after it: kept, and only someone who can refund may give it back", () => {
        const desk = cancelPlan({
            money: money(),
            freeCancelUntil: DEADLINE,
            timezone: ZONE,
            now: after,
            canRefund: false,
        });
        expect(desk).toMatchObject({ late: true, canOverride: false });
        expect(deadlineText(DEADLINE, ZONE)).toBe("Sat 19 Sep, 10:00");
        expect(desk?.body).toBe(
            "It's past the free-cancel time (Sat 19 Sep, 10:00), so the ₹400 deposit is kept. Only someone who can refund payments can give it back.",
        );
        const owner = cancelPlan({
            money: money(),
            freeCancelUntil: DEADLINE,
            timezone: ZONE,
            now: after,
            canRefund: true,
        });
        expect(owner).toMatchObject({ late: true, canOverride: true });
        expect(owner?.body).toMatch(/You can refund it anyway\.$/);
    });

    it("no deadline (no rule when booked) is never late", () => {
        expect(
            cancelPlan({
                money: money(),
                freeCancelUntil: null,
                timezone: ZONE,
                now: after,
                canRefund: false,
            })?.late,
        ).toBe(false);
    });

    it("nothing paid online, or already refunded: no word about money", () => {
        const plan = (m: BookingMoney | undefined) =>
            cancelPlan({
                money: m,
                freeCancelUntil: DEADLINE,
                timezone: ZONE,
                now: before,
                canRefund: true,
            });
        expect(plan(undefined)).toBeNull();
        expect(plan(money({ paidOnlineCents: 0 }))).toBeNull();
        expect(
            plan(
                money({
                    refund: {
                        amountCents: 40_000,
                        status: "PENDING",
                        beingConfirmed: false,
                    },
                }),
            ),
        ).toBeNull();
    });

    it("a full payment is a payment, not a deposit", () => {
        expect(
            cancelPlan({
                money: money({ deposit: false, paidOnlineCents: 80_000 }),
                freeCancelUntil: DEADLINE,
                timezone: ZONE,
                now: before,
                canRefund: false,
            })?.body,
        ).toBe(
            "It's before the free-cancel time, so the ₹800 payment is refunded to them.",
        );
    });
});

describe("cancelledMessage", () => {
    const refund = (status: "SENT" | "CONFIRMING" | "REFUSED") => ({
        refund: { amountCents: 40_000, currency: "INR", status },
        kept: null,
    });

    it("says what the cancel did with the money", () => {
        expect(cancelledMessage(refund("SENT"))).toEqual({
            tone: "success",
            title: "Booking cancelled. ₹400 is being refunded.",
        });
        expect(cancelledMessage(refund("CONFIRMING")).title).toBe(
            "Booking cancelled. The ₹400 refund is being confirmed with the payment provider.",
        );
        expect(cancelledMessage(refund("REFUSED"))).toMatchObject({
            tone: "error",
            title: "Booking cancelled, but the refund didn't go through.",
        });
        expect(
            cancelledMessage({
                refund: null,
                kept: { amountCents: 40_000, currency: "INR" },
            }).title,
        ).toBe("Booking cancelled. The ₹400 paid is kept.");
        expect(cancelledMessage(undefined).title).toBe("Booking cancelled");
    });
});

describe("canRefundPayments", () => {
    it("reads payment:manage, or an owner or admin without custom roles", () => {
        type Org = Parameters<typeof canRefundPayments>[0];
        const org = (over: Record<string, unknown>) =>
            ({ id: "o", name: "Kavi", ...over }) as unknown as Org;
        expect(canRefundPayments(org({ role: "OWNER" }))).toBe(true);
        expect(canRefundPayments(org({ role: "MEMBER" }))).toBe(false);
        expect(
            canRefundPayments(
                org({ role: "MEMBER", actions: ["payment:manage"] }),
            ),
        ).toBe(true);
        expect(
            canRefundPayments(
                org({ role: "ADMIN", actions: ["booking:write"] }),
            ),
        ).toBe(false);
        expect(canRefundPayments(null)).toBe(false);
    });
});
