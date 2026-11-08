jest.mock("../../env", () => ({ env: { NODE_ENV: "test" } }));

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CheckoutCancelDto } from "./checkout-return.dto";
import { CheckoutSessionController } from "./checkout-session.controller";
import type { CheckoutSessionService } from "./checkout-session.service";

describe("CheckoutSessionController (U7)", () => {
    const sessions = {
        read: jest.fn().mockResolvedValue({ status: "open" }),
        cancel: jest.fn().mockResolvedValue({ status: "closed" }),
    };
    const make = () =>
        new CheckoutSessionController(
            sessions as unknown as CheckoutSessionService,
        );

    beforeEach(() => jest.clearAllMocks());

    it("reads by the session id alone, never an organization from the caller", async () => {
        await expect(
            make().read("cs_test_a1B2", "203.0.113.1"),
        ).resolves.toEqual({ status: "open" });
        expect(sessions.read).toHaveBeenCalledWith("cs_test_a1B2");
    });

    it("anything that isn't a session id is the same 404, unasked", async () => {
        await expect(
            make().read("pi_123", "203.0.113.1"),
        ).rejects.toMatchObject({ status: 404 });
        expect(sessions.read).not.toHaveBeenCalled();
    });

    it("takes at most 30 reads a minute for one session, 60 for one caller", async () => {
        const controller = make();
        for (let i = 0; i < 30; i++) {
            await controller.read("cs_test_one", `203.0.113.${i}`);
        }
        await expect(
            controller.read("cs_test_one", "203.0.113.99"),
        ).rejects.toMatchObject({ status: 429 });

        const caller = make();
        for (let i = 0; i < 60; i++) {
            await caller.read(`cs_test_${i}`, "203.0.113.7");
        }
        await expect(
            caller.read("cs_test_x", "203.0.113.7"),
        ).rejects.toMatchObject({ status: 429 });
    });

    it("takes at most 6 cancels a minute for one intent", async () => {
        const controller = make();
        const body = { intent: "intent_1", token: "tok" };
        for (let i = 0; i < 6; i++) {
            await controller.cancel(body, `203.0.113.${i}`);
        }
        await expect(
            controller.cancel(body, "203.0.113.99"),
        ).rejects.toMatchObject({ status: 429 });
        expect(sessions.cancel).toHaveBeenCalledWith("intent_1", "tok");
    });
});

describe("CheckoutCancelDto (U7)", () => {
    const errors = async (input: Record<string, unknown>) =>
        (await validate(plainToInstance(CheckoutCancelDto, input))).map(
            (e) => e.property,
        );

    it("takes an intent id and a base64url token", async () => {
        await expect(
            errors({
                intent: "0b6f1c4e-6b0e-4a43-9a8e-2f0f7f2b9c11",
                token: "Q1w2E3-r4_T5",
            }),
        ).resolves.toEqual([]);
    });

    it("refuses what isn't one", async () => {
        await expect(
            errors({ intent: "a b", token: "x".repeat(200) }),
        ).resolves.toEqual(["intent", "token"]);
        await expect(errors({})).resolves.toEqual(["intent", "token"]);
    });
});
