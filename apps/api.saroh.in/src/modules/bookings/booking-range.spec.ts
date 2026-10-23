import { BadRequestException } from "@nestjs/common";

jest.mock("@saroh/database", () => ({ prisma: {} }));

import { MAX_RANGE_DAYS, parseRange } from "./booking-slots";

const DAY = 86_400_000;

describe("an availability range", () => {
    const from = new Date("2026-11-01T00:00:00Z");
    const after = (days: number) =>
        new Date(from.getTime() + days * DAY).toISOString();

    it("is taken up to its longest", () => {
        expect(
            parseRange(
                from.toISOString(),
                after(MAX_RANGE_DAYS),
            ).to.toISOString(),
        ).toBe(after(MAX_RANGE_DAYS));
    });

    it("is refused past it, so a stranger can't ask for a century", () => {
        expect(() =>
            parseRange(from.toISOString(), after(MAX_RANGE_DAYS + 1)),
        ).toThrow(BadRequestException);
        expect(() =>
            parseRange("2000-01-01T00:00:00Z", "2100-01-01T00:00:00Z"),
        ).toThrow(BadRequestException);
    });
});
