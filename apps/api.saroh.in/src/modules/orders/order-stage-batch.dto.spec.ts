import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { validationPipeOptions } from "../../common/validation";
import { CreateStageBatchDto, STAGE_BATCH_MAX } from "./order-stage-batch.dto";

/**
 * A bulk move's body (round-2 B6): at most 100 orders, each once, with
 * where the list saw it and the step to take, under an id the client made.
 */
describe("CreateStageBatchDto (B6)", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const parse = (value: Record<string, unknown>) =>
        pipe.transform(value, { type: "body", metatype: CreateStageBatchDto });
    const line = (n: number) => ({
        orderId: `ord_${n}`,
        from: "PREPARING",
        to: "READY",
    });
    const many = (n: number) => Array.from({ length: n }, (_, i) => line(i));

    it("takes 100 moves", async () => {
        const dto = await parse({
            batchId: randomUUID(),
            lines: many(STAGE_BATCH_MAX),
        });
        expect(dto.lines).toHaveLength(100);
    });

    it("refuses 101 moves with 400 (a cap of 100)", async () => {
        await expect(
            parse({ batchId: randomUUID(), lines: many(101) }),
        ).rejects.toThrow(BadRequestException);
    });

    it.each([
        ["no moves", { lines: [] }],
        ["one order twice", { lines: [line(1), line(1)] }],
        ["an unknown step", { lines: [{ ...line(1), to: "EATEN" }] }],
        ["an id that isn't a uuid", { batchId: "b1", lines: [line(1)] }],
        ["a boolean sent as text", { lines: [line(1)], now: "false" }],
        ["a field it doesn't know", { lines: [line(1)], storeId: "s1" }],
    ])("refuses %s", async (_, over) => {
        await expect(parse({ batchId: randomUUID(), ...over })).rejects.toThrow(
            BadRequestException,
        );
    });
});
