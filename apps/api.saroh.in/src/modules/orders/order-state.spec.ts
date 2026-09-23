import { BadRequestException } from "@nestjs/common";

import type { OrderStatus, PaymentStatus } from "./dto";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "./dto";
import {
    PAYMENT_TRANSITIONS,
    STATUS_TRANSITIONS,
    assertPaymentTransition,
    assertStatusTransition,
    canTransitionPayment,
    canTransitionStatus,
} from "./order-state";

describe("order-state (pure lifecycle state machine)", () => {
    describe("status transitions", () => {
        // Characterization: the whole table as it stands, written out so any
        // widening is a visible, deliberate edit here.
        it("pins the status transition table", () => {
            expect(STATUS_TRANSITIONS).toEqual({
                PENDING: ["PROCESSING", "CANCELLED"],
                PROCESSING: ["SHIPPED", "DELIVERED", "CANCELLED"],
                SHIPPED: ["DELIVERED"],
                DELIVERED: [],
                CANCELLED: [],
            });
        });

        it("pins the payment transition table", () => {
            expect(PAYMENT_TRANSITIONS).toEqual({
                UNPAID: ["PAID", "FAILED"],
                FAILED: ["PAID"],
                PAID: ["REFUNDED"],
                REFUNDED: [],
            });
        });

        it("allows every legal status transition", () => {
            for (const from of ORDER_STATUSES) {
                for (const to of STATUS_TRANSITIONS[from]) {
                    expect(canTransitionStatus(from, to)).toBe(true);
                    expect(() =>
                        assertStatusTransition(from, to),
                    ).not.toThrow();
                }
            }
        });

        it.each<[OrderStatus, OrderStatus]>([
            ["DELIVERED", "PROCESSING"],
            ["SHIPPED", "CANCELLED"],
            ["CANCELLED", "PROCESSING"],
            ["CANCELLED", "PENDING"],
            ["DELIVERED", "CANCELLED"],
            ["PENDING", "SHIPPED"],
            ["PENDING", "DELIVERED"],
            ["SHIPPED", "PROCESSING"],
        ])("rejects the illegal transition %s → %s", (from, to) => {
            expect(canTransitionStatus(from, to)).toBe(false);
            expect(() => assertStatusTransition(from, to)).toThrow(
                BadRequestException,
            );
        });

        it("treats same → same as NOT a legal transition (no self-loops)", () => {
            for (const s of ORDER_STATUSES) {
                expect(canTransitionStatus(s, s)).toBe(false);
            }
        });

        it("has no outgoing transitions from terminal states", () => {
            expect(STATUS_TRANSITIONS.DELIVERED).toEqual([]);
            expect(STATUS_TRANSITIONS.CANCELLED).toEqual([]);
            for (const to of ORDER_STATUSES) {
                expect(canTransitionStatus("DELIVERED", to)).toBe(false);
                expect(canTransitionStatus("CANCELLED", to)).toBe(false);
            }
        });

        it("names the illegal from → to in the thrown error", () => {
            try {
                assertStatusTransition("DELIVERED", "PROCESSING");
                throw new Error("expected assertStatusTransition to throw");
            } catch (err) {
                expect(err).toBeInstanceOf(BadRequestException);
                const res = (err as BadRequestException).getResponse() as {
                    message: string;
                    field: string;
                };
                expect(res.message).toContain("DELIVERED");
                expect(res.message).toContain("PROCESSING");
                expect(res.field).toBe("status");
            }
        });

        it("a collection order goes from PROCESSING straight to DELIVERED (ADR-008)", () => {
            expect(canTransitionStatus("PROCESSING", "DELIVERED")).toBe(true);
            // Still no way back, and no skipping the work.
            expect(canTransitionStatus("DELIVERED", "PROCESSING")).toBe(false);
            expect(canTransitionStatus("PENDING", "DELIVERED")).toBe(false);
        });

        it("a SHIPPED order can be delivered but never cancelled", () => {
            expect(canTransitionStatus("SHIPPED", "DELIVERED")).toBe(true);
            expect(canTransitionStatus("SHIPPED", "CANCELLED")).toBe(false);
        });
    });

    describe("payment transitions", () => {
        it("allows every legal payment transition", () => {
            for (const from of PAYMENT_STATUSES) {
                for (const to of PAYMENT_TRANSITIONS[from]) {
                    expect(canTransitionPayment(from, to)).toBe(true);
                    expect(() =>
                        assertPaymentTransition(from, to),
                    ).not.toThrow();
                }
            }
        });

        it.each<[PaymentStatus, PaymentStatus]>([
            ["REFUNDED", "PAID"],
            ["REFUNDED", "UNPAID"],
            ["PAID", "UNPAID"],
            ["PAID", "FAILED"],
            ["FAILED", "REFUNDED"],
            ["UNPAID", "REFUNDED"],
        ])("rejects the illegal transition %s → %s", (from, to) => {
            expect(canTransitionPayment(from, to)).toBe(false);
            expect(() => assertPaymentTransition(from, to)).toThrow(
                BadRequestException,
            );
        });

        it("treats same → same as NOT a legal transition", () => {
            for (const s of PAYMENT_STATUSES) {
                expect(canTransitionPayment(s, s)).toBe(false);
            }
        });

        it("REFUNDED is terminal (no outgoing transitions)", () => {
            expect(PAYMENT_TRANSITIONS.REFUNDED).toEqual([]);
            for (const to of PAYMENT_STATUSES) {
                expect(canTransitionPayment("REFUNDED", to)).toBe(false);
            }
        });

        it("names the illegal from → to in the thrown error", () => {
            try {
                assertPaymentTransition("REFUNDED", "PAID");
                throw new Error("expected assertPaymentTransition to throw");
            } catch (err) {
                expect(err).toBeInstanceOf(BadRequestException);
                const res = (err as BadRequestException).getResponse() as {
                    message: string;
                    field: string;
                };
                expect(res.message).toContain("REFUNDED");
                expect(res.message).toContain("PAID");
                expect(res.field).toBe("paymentStatus");
            }
        });
    });
});
