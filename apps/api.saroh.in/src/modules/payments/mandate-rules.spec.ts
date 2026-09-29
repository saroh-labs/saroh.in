import {
    MANDATE_MAX_CENTS,
    mandateLimitCents,
    maskVpa,
    nextMandateStatus,
    providerName,
    safeDisplayHint,
    safeFailureReason,
} from "./mandate-rules";

describe("mandateLimitCents", () => {
    it("asks for half again, rounded up to the next ₹100", () => {
        expect(mandateLimitCents(120_000)).toBe(180_000);
        expect(mandateLimitCents(99_900)).toBe(150_000);
        expect(mandateLimitCents(100)).toBe(10_000);
    });

    it("never above what the provider allows", () => {
        expect(mandateLimitCents(9_000_000)).toBe(MANDATE_MAX_CENTS);
    });

    it("refuses a price that isn't a positive whole number of minor units", () => {
        expect(() => mandateLimitCents(0)).toThrow();
        expect(() => mandateLimitCents(12.5)).toThrow();
    });
});

describe("what may be shown of a customer's account", () => {
    it("masks a UPI handle to two characters and the bank", () => {
        expect(maskVpa("asharao", "okbank")).toBe("as•••@okbank");
        expect(maskVpa(null, null)).toBeNull();
    });

    it("keeps a masked handle or a last four, and drops anything else", () => {
        expect(safeDisplayHint("as•••@okbank")).toBe("as•••@okbank");
        expect(safeDisplayHint("te•••@razorpay")).toBe("te•••@razorpay");
        expect(safeDisplayHint("•••• 4242")).toBe("•••• 4242");
        expect(safeDisplayHint("asharao@okbank")).toBeNull();
        expect(safeDisplayHint("4111111111111111")).toBeNull();
        expect(safeDisplayHint("")).toBeNull();
    });

    it("keeps a reason only as a short code", () => {
        expect(safeFailureReason("mandate_rejected")).toBe("mandate_rejected");
        expect(safeFailureReason("The customer said <no>")).toBe("UNKNOWN");
        expect(safeFailureReason(undefined)).toBe("UNKNOWN");
    });
});

describe("nextMandateStatus", () => {
    it.each([
        ["PENDING", "ACTIVE", "ACTIVE"],
        ["PAUSED", "ACTIVE", "ACTIVE"],
        ["ACTIVE", "ACTIVE", null],
        ["ACTIVE", "PAUSED", "PAUSED"],
        ["PENDING", "PAUSED", null],
        ["PENDING", "CANCELLED", "CANCELLED"],
        ["ACTIVE", "CANCELLED", "CANCELLED"],
        ["PAUSED", "CANCELLED", "CANCELLED"],
        ["PENDING", "FAILED", "FAILED"],
        ["ACTIVE", "FAILED", null],
        ["CANCELLED", "ACTIVE", null],
        ["FAILED", "ACTIVE", null],
        ["CANCELLED", "CANCELLED", null],
    ] as const)("%s reported %s → %s", (current, reported, next) => {
        expect(nextMandateStatus(current, reported)).toBe(next);
    });
});

describe("providerName", () => {
    it("names the provider as the merchant knows it", () => {
        expect(providerName("RAZORPAY")).toBe("Razorpay");
        expect(providerName(null)).toBe("your payment provider");
    });
});
