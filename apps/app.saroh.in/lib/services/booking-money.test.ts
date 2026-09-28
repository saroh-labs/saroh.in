import { describe, expect, it } from "vitest";

import type { BookingMoney } from "./booking-money";
import {
    cancelledMessage,
    cancelPlan,
    canReadOrders,
    canRefundPayments,
    deadlineText,
    paidLine,
    refundLine,
    refundPolicyLine,
    TREATMENT_REFUNDED_FROM_ORDER,
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
            keeps: false,
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

describe("the business's refund policy (E30, DEC-058)", () => {
    const before = new Date("2026-09-19T03:00:00.000Z").getTime();
    const after = new Date("2026-09-19T06:00:00.000Z").getTime();
    const plan = (m: BookingMoney, now: number, canRefund: boolean) =>
        cancelPlan({
            money: m,
            freeCancelUntil: DEADLINE,
            timezone: ZONE,
            now,
            canRefund,
        });

    it("on, as set: the same as before, the deposit refunded in time", () => {
        expect(
            plan(money({ refundInTimeCancels: true }), before, false),
        ).toMatchObject({ late: false, keeps: false, canOverride: false });
    });

    it("off: in time, the money is kept, and says who can refund it", () => {
        const desk = plan(money({ refundInTimeCancels: false }), before, false);
        expect(desk).toMatchObject({
            late: false,
            keeps: true,
            canOverride: false,
        });
        expect(desk?.body).toBe(
            "Your refund policy doesn't refund cancellations automatically, so the ₹400 deposit is kept. Only someone who can refund payments can give it back.",
        );
        const owner = plan(money({ refundInTimeCancels: false }), before, true);
        expect(owner).toMatchObject({ keeps: true, canOverride: true });
        expect(owner?.body).toMatch(/You can refund it anyway\.$/);
    });

    it("on: a late cancel still keeps it", () => {
        expect(
            plan(money({ refundInTimeCancels: true }), after, false),
        ).toMatchObject({ late: true, keeps: true });
    });

    it("never offers more than is left of what was received", () => {
        const p = plan(money({ refundableCents: 25_000 }), before, false);
        expect(p?.amount).toBe("₹250");
        expect(p?.body).toBe(
            "It's before the free-cancel time, so the ₹250 deposit is refunded to them.",
        );
        expect(plan(money({ refundableCents: 0 }), before, true)).toBeNull();
    });

    it("the booking page states the policy as set", () => {
        expect(refundPolicyLine(money(), true)).toBe(
            "Your refund policy: the ₹400 deposit is refunded automatically if it's cancelled by then.",
        );
        expect(
            refundPolicyLine(
                money({ deposit: false, paidOnlineCents: 80_000 }),
                false,
            ),
        ).toBe(
            "Your refund policy: the ₹800 paid online is refunded automatically if it's cancelled.",
        );
        expect(
            refundPolicyLine(money({ refundInTimeCancels: false }), true),
        ).toBe(
            "Your refund policy: the ₹400 deposit isn't refunded automatically if it's cancelled.",
        );
    });

    it("says nothing when nothing paid online is left to refund", () => {
        expect(refundPolicyLine(undefined, true)).toBeNull();
        expect(
            refundPolicyLine(money({ paidOnlineCents: 0 }), true),
        ).toBeNull();
        expect(
            refundPolicyLine(money({ refundableCents: 0 }), true),
        ).toBeNull();
        expect(
            refundPolicyLine(
                money({
                    refund: {
                        amountCents: 40_000,
                        status: "SUCCEEDED",
                        beingConfirmed: false,
                    },
                }),
                true,
            ),
        ).toBeNull();
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

describe("a visit of a treatment (E9, DEC-050)", () => {
    const visit = money({
        paidOnlineCents: 1_200_000,
        deposit: false,
        refundableCents: 0,
        treatmentOrderId: "ord_1",
    });

    it("never refunds on its own: the dialog points to its order", () => {
        const plan = cancelPlan({
            money: visit,
            freeCancelUntil: DEADLINE,
            timezone: ZONE,
            now: Date.parse("2026-09-10T00:00:00.000Z"),
            canRefund: true,
        });
        expect(plan).toMatchObject({
            keeps: false,
            canOverride: false,
            treatmentOrderId: "ord_1",
        });
        expect(plan?.body).toContain(TREATMENT_REFUNDED_FROM_ORDER);
        expect(TREATMENT_REFUNDED_FROM_ORDER).toBe(
            "Money for this treatment is refunded from its order.",
        );
    });

    it("says the same late, and with nothing paid online", () => {
        for (const m of [visit, { ...visit, paidOnlineCents: 0 }]) {
            expect(
                cancelPlan({
                    money: m,
                    freeCancelUntil: DEADLINE,
                    timezone: ZONE,
                    now: Date.parse("2026-09-30T00:00:00.000Z"),
                    canRefund: false,
                })?.body,
            ).toContain(TREATMENT_REFUNDED_FROM_ORDER);
        }
    });

    it("the toast says the visit was cancelled, and nothing about a refund", () => {
        expect(
            cancelledMessage({
                refund: null,
                kept: null,
                treatmentOrderId: "ord_1",
            }),
        ).toEqual({ tone: "success", title: "Visit cancelled" });
    });
});

describe("canReadOrders", () => {
    it("reads order:read, or an owner or admin without custom roles", () => {
        type Org = Parameters<typeof canReadOrders>[0];
        const org = (over: Record<string, unknown>) =>
            ({ id: "o", name: "Kavi", ...over }) as unknown as Org;
        expect(canReadOrders(org({ role: "OWNER" }))).toBe(true);
        expect(canReadOrders(org({ role: "MEMBER" }))).toBe(false);
        expect(
            canReadOrders(org({ role: "MEMBER", actions: ["order:read"] })),
        ).toBe(true);
        expect(canReadOrders(null)).toBe(false);
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
