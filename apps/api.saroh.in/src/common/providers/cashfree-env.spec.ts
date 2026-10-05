import { cashfreeBaseUrl, cashfreeMode } from "./cashfree-env";

describe("Cashfree environment", () => {
    it("is production unless sandbox is asked for", () => {
        expect(cashfreeMode("sandbox")).toBe("sandbox");
        expect(cashfreeMode("production")).toBe("production");
        expect(cashfreeMode(undefined)).toBe("production");
        expect(cashfreeMode("Sandbox")).toBe("production");
    });

    it("talks to each mode's own host", () => {
        expect(cashfreeBaseUrl("sandbox")).toBe(
            "https://sandbox.cashfree.com/pg",
        );
        expect(cashfreeBaseUrl("production")).toBe(
            "https://api.cashfree.com/pg",
        );
    });
});
