import { describe, expect, it } from "vitest";

import {
    canCancel,
    nextStep,
    PAYMENT_TRANSITIONS,
    standingOf,
    STATUS_TRANSITIONS,
} from "@/lib/orders/lifecycle";

describe("nextStep", () => {
    it("walks an order forward one state at a time", () => {
        expect(nextStep("PENDING")?.to).toBe("PROCESSING");
        expect(nextStep("PROCESSING")?.to).toBe("SHIPPED");
        expect(nextStep("SHIPPED")?.to).toBe("DELIVERED");
    });

    it("offers nothing once the goods are done with", () => {
        expect(nextStep("DELIVERED")).toBeNull();
        expect(nextStep("CANCELLED")).toBeNull();
    });

    it("only ever offers a move the server allows", () => {
        for (const status of Object.keys(
            STATUS_TRANSITIONS,
        ) as (keyof typeof STATUS_TRANSITIONS)[]) {
            const step = nextStep(status);
            if (step) expect(STATUS_TRANSITIONS[status]).toContain(step.to);
        }
    });
});

describe("canCancel", () => {
    it("allows cancelling before the goods go out, and not after", () => {
        expect(canCancel("PENDING")).toBe(true);
        expect(canCancel("PROCESSING")).toBe(true);
        expect(canCancel("SHIPPED")).toBe(false);
    });
});

describe("standingOf", () => {
    it("puts money first: a refunded delivery reads as refunded", () => {
        expect(standingOf("DELIVERED", "REFUNDED")).toBe("REFUNDED");
    });

    it("then cancellation, then the goods", () => {
        expect(standingOf("CANCELLED", "UNPAID")).toBe("CANCELLED");
        expect(standingOf("PROCESSING", "PAID")).toBe("UNFULFILLED");
        expect(standingOf("SHIPPED", "PAID")).toBe("FULFILLED");
    });
});

describe("payment moves", () => {
    it("never goes back to unpaid", () => {
        for (const next of Object.values(PAYMENT_TRANSITIONS)) {
            expect(next).not.toContain("UNPAID");
        }
    });
});
