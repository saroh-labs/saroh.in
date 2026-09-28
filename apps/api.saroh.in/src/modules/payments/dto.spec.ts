// What the refund route accepts (B8), checked with the same validator the
// global ValidationPipe runs.
import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { RefundOrderDto } from "./dto";

async function refused(body: unknown): Promise<string[]> {
    return (await validate(plainToInstance(RefundOrderDto, body)))
        .map((e) => e.property)
        .sort();
}

describe("a refund by line, as before B8", () => {
    it("needs no reason, and takes an empty one", async () => {
        expect(await refused({})).toEqual([]);
        expect(
            await refused({ lines: [{ itemId: "i1", quantity: 1 }] }),
        ).toEqual([]);
        expect(await refused({ reason: "" })).toEqual([]);
        expect(await refused({ reason: "Quality" })).toEqual([]);
    });
});

describe("another amount (kind goodwill)", () => {
    it("takes an amount with up to two decimals and a reason", async () => {
        expect(
            await refused({ kind: "goodwill", amount: "50", reason: "Late" }),
        ).toEqual([]);
        expect(
            await refused({
                kind: "goodwill",
                amount: "49.50",
                reason: "Goodwill",
            }),
        ).toEqual([]);
    });

    it("refuses it with no reason, or a blank one (400)", async () => {
        expect(await refused({ kind: "goodwill", amount: "50" })).toEqual([
            "reason",
        ]);
        expect(
            await refused({ kind: "goodwill", amount: "50", reason: "   " }),
        ).toEqual(["reason"]);
    });

    it("refuses it with no amount, or one that isn't money", async () => {
        expect(await refused({ kind: "goodwill", reason: "Late" })).toEqual([
            "amount",
        ]);
        for (const amount of ["-5", "5.001", "abc", "1e3"]) {
            expect(
                await refused({ kind: "goodwill", amount, reason: "Late" }),
            ).toEqual(["amount"]);
        }
    });

    it("refuses an unknown kind", async () => {
        expect(await refused({ kind: "gift" })).toEqual(["kind"]);
    });
});
