import { BadRequestException } from "@nestjs/common";

import { BUSY_READ_MAX_DAYS, readRange } from "./busy-range";

describe("the busy read's range", () => {
    it("reads two instants", () => {
        const { from, to } = readRange(
            "2026-11-23T00:00:00.000Z",
            "2026-11-30T00:00:00.000Z",
        );
        expect(to.getTime() - from.getTime()).toBe(7 * 86_400_000);
    });

    it.each([
        [undefined, "2026-11-30T00:00:00Z"],
        ["2026-11-23T00:00:00Z", undefined],
        ["not a date", "2026-11-30T00:00:00Z"],
        ["2026-11-30T00:00:00Z", "2026-11-23T00:00:00Z"],
        ["2026-11-23T00:00:00Z", "2026-11-23T00:00:00Z"],
    ])("refuses %s to %s", (from, to) => {
        expect(() => readRange(from, to)).toThrow(BadRequestException);
    });

    it("refuses more than a calendar shows at once", () => {
        const from = new Date("2026-11-01T00:00:00Z");
        const to = new Date(
            from.getTime() + (BUSY_READ_MAX_DAYS + 1) * 86_400_000,
        );
        expect(() => readRange(from.toISOString(), to.toISOString())).toThrow(
            BadRequestException,
        );
    });
});
