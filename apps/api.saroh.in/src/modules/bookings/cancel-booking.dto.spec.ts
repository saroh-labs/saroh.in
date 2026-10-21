import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { classCancelledData, classCancelReasonOf } from "./booking-event-type";
import { CancelBookingDto } from "./dto";

/**
 * The reason a class is cancelled with (DEC-178, #1172): one line of the
 * business's own words, 1 to 200 characters once trimmed.
 */
async function check(body: Record<string, unknown>) {
    const dto = plainToInstance(CancelBookingDto, body);
    const errors = await validate(dto);
    return { dto, fields: errors.map((e) => e.property) };
}

describe("CancelBookingDto reason (#1172)", () => {
    it("takes no body at all: a plain cancel", async () => {
        const { dto, fields } = await check({});
        expect(fields).toEqual([]);
        expect(dto.reason).toBeUndefined();
    });

    it("trims it and makes it one line", async () => {
        const { dto, fields } = await check({
            reason: "  The teacher is unwell.\n\n  Sorry!  ",
        });
        expect(fields).toEqual([]);
        expect(dto.reason).toBe("The teacher is unwell. Sorry!");
    });

    it("takes 200 characters, refuses 201", async () => {
        expect((await check({ reason: "a".repeat(200) })).fields).toEqual([]);
        expect(
            (await check({ reason: ` ${"a".repeat(200)} ` })).fields,
        ).toEqual([]);
        expect((await check({ reason: "a".repeat(201) })).fields).toEqual([
            "reason",
        ]);
    });

    it("refuses a blank or a reason that isn't words", async () => {
        for (const bad of ["", "   ", "\n", 42, ["x"]]) {
            expect((await check({ reason: bad })).fields).toEqual(["reason"]);
        }
    });
});

describe("the class cancel's event data (#1172)", () => {
    it("keeps the reason when there is one", () => {
        expect(classCancelledData("Roof leak")).toEqual({
            classCancelled: true,
            reason: "Roof leak",
        });
        expect(classCancelledData(undefined)).toEqual({ classCancelled: true });
    });

    it("reads it back, and nothing from an old cancel or odd data", () => {
        expect(
            classCancelReasonOf({ classCancelled: true, reason: " Rain " }),
        ).toBe("Rain");
        for (const none of [
            null,
            undefined,
            {},
            { classCancelled: true },
            { reason: "" },
            { reason: 7 },
            ["Rain"],
            "Rain",
        ]) {
            expect(classCancelReasonOf(none)).toBeNull();
        }
    });
});
