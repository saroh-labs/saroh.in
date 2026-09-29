import { checkCentsFor, checkViewOf } from "./authorisation-check";

const at = (iso: string) => new Date(iso);

describe("checkCentsFor (DEC-064)", () => {
    const razorpay = { authorisationMinimumCents: { UPI: 100, CARD: 100 } };

    it("takes the provider's minimum for UPI and card, none for eMandate", () => {
        expect(checkCentsFor(razorpay, "UPI")).toBe(100);
        expect(checkCentsFor(razorpay, "CARD")).toBe(100);
        expect(checkCentsFor(razorpay, "EMANDATE")).toBe(0);
    });

    it("a provider that names no minimum takes no check", () => {
        expect(checkCentsFor({}, "UPI")).toBe(0);
    });

    it("never a strange minimum", () => {
        expect(
            checkCentsFor({ authorisationMinimumCents: { UPI: -5 } }, "UPI"),
        ).toBe(0);
        expect(
            checkCentsFor({ authorisationMinimumCents: { UPI: 1.5 } }, "UPI"),
        ).toBe(0);
    });
});

describe("checkViewOf", () => {
    const check = (
        status: string,
        refunds: { status: string; amountCents?: number; updatedAt?: Date }[],
    ) => ({
        status,
        amountCents: 100,
        currency: "INR",
        refunds: refunds.map((r) => ({
            status: r.status,
            amountCents: r.amountCents ?? 100,
            updatedAt: r.updatedAt ?? at("2026-09-29T10:00:00Z"),
        })),
    });

    it("nothing captured: no check to speak of", () => {
        expect(checkViewOf(null)).toBeNull();
        expect(checkViewOf(check("REQUIRES_PAYMENT", []))).toBeNull();
        expect(checkViewOf(check("FAILED", []))).toBeNull();
    });

    it("captured, refund on its way", () => {
        expect(
            checkViewOf(check("SUCCEEDED", [{ status: "PENDING" }])),
        ).toEqual({
            amount: "1.00",
            currency: "INR",
            state: "REFUNDING",
            refundedAt: null,
        });
        // Captured a moment before its refund row: still on its way.
        expect(checkViewOf(check("SUCCEEDED", []))?.state).toBe("REFUNDING");
    });

    it("refunded, on the day the provider said so", () => {
        expect(
            checkViewOf(
                check("SUCCEEDED", [
                    {
                        status: "SUCCEEDED",
                        updatedAt: at("2026-09-30T06:00:00Z"),
                    },
                ]),
            ),
        ).toMatchObject({
            state: "REFUNDED",
            refundedAt: "2026-09-30T06:00:00.000Z",
        });
    });

    it("a refund the provider refused: not refunded", () => {
        expect(
            checkViewOf(check("SUCCEEDED", [{ status: "FAILED" }]))?.state,
        ).toBe("NOT_REFUNDED");
    });

    it("refused, then refunded by hand in the provider's dashboard: refunded", () => {
        expect(
            checkViewOf(
                check("SUCCEEDED", [
                    { status: "FAILED" },
                    { status: "SUCCEEDED" },
                ]),
            )?.state,
        ).toBe("REFUNDED");
    });

    it("part of it back is still on its way", () => {
        expect(
            checkViewOf(
                check("SUCCEEDED", [{ status: "SUCCEEDED", amountCents: 50 }]),
            )?.state,
        ).toBe("REFUNDING");
    });
});
