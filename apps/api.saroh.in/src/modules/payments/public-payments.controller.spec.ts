import { HttpException } from "@nestjs/common";

import type { PaymentsService } from "./payments.service";
import { PublicPaymentsController } from "./public-payments.controller";

describe("PublicPaymentsController limits (PAY-08)", () => {
    const payments = {
        createIntentForOrderPublic: jest.fn().mockResolvedValue({}),
        getReceipt: jest.fn().mockResolvedValue({}),
    };
    const make = () =>
        new PublicPaymentsController(payments as unknown as PaymentsService);

    beforeEach(() => jest.clearAllMocks());

    it("opens at most 10 intents a minute for one order, whoever asks", async () => {
        const controller = make();
        for (let i = 0; i < 10; i++) {
            await controller.createIntent("order_1", {}, `203.0.113.${i}`);
        }
        await expect(
            controller.createIntent("order_1", {}, "203.0.113.99"),
        ).rejects.toBeInstanceOf(HttpException);
        // Another order is its own window.
        await expect(
            controller.createIntent("order_2", {}, "203.0.113.99"),
        ).resolves.toEqual({});
        expect(payments.createIntentForOrderPublic).toHaveBeenCalledTimes(11);
    });

    it("stops one caller opening intents across many orders", async () => {
        const controller = make();
        for (let i = 0; i < 30; i++) {
            await controller.createIntent(`order_${i}`, {}, "203.0.113.7");
        }
        await expect(
            controller.createIntent("order_x", {}, "203.0.113.7"),
        ).rejects.toMatchObject({ status: 429 });
    });

    it("lets a checkout poll its receipt, within reason", async () => {
        const controller = make();
        for (let i = 0; i < 240; i++) {
            await controller.receipt("order_1", "tok", "203.0.113.8");
        }
        await expect(
            controller.receipt("order_1", "tok", "203.0.113.8"),
        ).rejects.toMatchObject({ status: 429 });
    });

    it("refuses a receipt asked for by the order's id alone, in words", async () => {
        const controller = make();
        for (const token of [undefined, ""]) {
            await expect(
                controller.receipt("order_1", token, "203.0.113.9"),
            ).rejects.toMatchObject({
                status: 403,
                message: expect.stringContaining("from the link in your email"),
            });
        }
        expect(payments.getReceipt).not.toHaveBeenCalled();
        await controller.receipt("order_1", "tok", "203.0.113.9");
        expect(payments.getReceipt).toHaveBeenCalledWith("order_1", "tok");
    });
});
