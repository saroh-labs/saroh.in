import { BadRequestException } from "@nestjs/common";

import { executeBulk, MAX_BULK } from "./bulk";

describe("executeBulk (safe bulk contract)", () => {
    it("is bounded — rejects more than MAX_BULK ids", async () => {
        const ids = Array.from({ length: MAX_BULK + 1 }, (_, i) => `id${i}`);
        await expect(
            executeBulk(ids, async () => undefined),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("is idempotent — a duplicate id is applied once", async () => {
        const op = jest.fn().mockResolvedValue(undefined);
        const result = await executeBulk(["a", "a", "b"], op);
        expect(op).toHaveBeenCalledTimes(2);
        expect(result.succeeded.sort()).toEqual(["a", "b"]);
    });

    it("collects partial failures without aborting the rest", async () => {
        const op = jest.fn((id: string) =>
            id === "bad"
                ? Promise.reject(new Error("not allowed"))
                : Promise.resolve(),
        );
        const result = await executeBulk(["ok1", "bad", "ok2"], op);
        expect(result.succeeded).toEqual(["ok1", "ok2"]);
        expect(result.failed).toEqual([{ id: "bad", error: "not allowed" }]);
    });

    it("handles an empty selection", async () => {
        const result = await executeBulk([], async () => undefined);
        expect(result).toEqual({ succeeded: [], failed: [] });
    });
});
