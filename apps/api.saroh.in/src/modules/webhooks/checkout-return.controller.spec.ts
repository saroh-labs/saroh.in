jest.mock("../../env", () => ({ env: { NODE_ENV: "test" } }));

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CheckoutReturnController } from "./checkout-return.controller";
import { CheckoutReturnDto } from "./checkout-return.dto";
import type { PaymentLookupService } from "./payment-lookup.service";

describe("CheckoutReturnController (P1)", () => {
    const lookup = {
        confirmCheckoutReturn: jest.fn().mockResolvedValue({ confirmed: true }),
    };
    const make = () =>
        new CheckoutReturnController(lookup as unknown as PaymentLookupService);
    const body = (order: string) => ({
        provider: "RAZORPAY",
        providerOrderId: order,
        providerPaymentId: "pay_1",
        signature: "ab".repeat(32),
    });

    beforeEach(() => jest.clearAllMocks());

    it("passes the return through, never an organization from the caller", async () => {
        await expect(
            make().confirm(body("order_1"), "203.0.113.1"),
        ).resolves.toEqual({ confirmed: true });
        expect(lookup.confirmCheckoutReturn).toHaveBeenCalledWith(
            body("order_1"),
        );
    });

    it("takes at most 6 returns a minute for one provider order", async () => {
        const controller = make();
        for (let i = 0; i < 6; i++) {
            await controller.confirm(body("order_1"), `203.0.113.${i}`);
        }
        await expect(
            controller.confirm(body("order_1"), "203.0.113.99"),
        ).rejects.toMatchObject({ status: 429 });
        // Another order is its own window.
        await expect(
            controller.confirm(body("order_2"), "203.0.113.99"),
        ).resolves.toEqual({ confirmed: true });
        expect(lookup.confirmCheckoutReturn).toHaveBeenCalledTimes(7);
    });

    it("stops one caller posting returns across many orders", async () => {
        const controller = make();
        for (let i = 0; i < 20; i++) {
            await controller.confirm(body(`order_${i}`), "203.0.113.7");
        }
        await expect(
            controller.confirm(body("order_x"), "203.0.113.7"),
        ).rejects.toMatchObject({ status: 429 });
    });
});

describe("CheckoutReturnDto (P1)", () => {
    const errors = async (input: Record<string, unknown>) =>
        (await validate(plainToInstance(CheckoutReturnDto, input))).map(
            (e) => e.property,
        );

    it("takes Razorpay's three fields, and Cashfree's order alone", async () => {
        await expect(
            errors({
                provider: "razorpay",
                providerOrderId: "order_Q1w2E3",
                providerPaymentId: "pay_Q1w2E3",
                signature: "ab".repeat(32),
            }),
        ).resolves.toEqual([]);
        await expect(
            errors({ provider: "CASHFREE", providerOrderId: "2149460581" }),
        ).resolves.toEqual([]);
    });

    it("refuses an unknown provider and ids that aren't ids", async () => {
        await expect(
            errors({ provider: "PAYPAL", providerOrderId: "order_1" }),
        ).resolves.toEqual(["provider"]);
        await expect(
            errors({
                provider: "RAZORPAY",
                providerOrderId: "../orders",
                providerPaymentId: "pay 1",
            }),
        ).resolves.toEqual(["providerOrderId", "providerPaymentId"]);
    });
});
