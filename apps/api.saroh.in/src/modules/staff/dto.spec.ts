// What a person's own booking rules accept, through the global
// ValidationPipe's own options (DEC-170): free cancelling follows the
// business's refund policy, so a person's own is refused with words that
// say why (owner, 20 Oct 2026).
import "reflect-metadata";

import type { BadRequestException } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";

import { validationPipeOptions } from "../../common/validation";
import { PERSON_FREE_CANCEL_REFUSAL } from "../bookings/person-rules";
import { UpdateBookingRulesDto, UpdatePersonRulesDto } from "./dto";

const pipe = new ValidationPipe(validationPipeOptions);
const refusal = async (metatype: new () => object, body: unknown) =>
    pipe
        .transform(body, { type: "body", metatype })
        .then(() => null)
        .catch((e: BadRequestException) => e.getResponse());

describe("a person's own booking rules", () => {
    it("takes their notice, how far ahead and their gap", async () => {
        expect(
            await refusal(UpdatePersonRulesDto, {
                latestBookingMinutes: 720,
                bookAheadDays: 14,
                gapMinutes: null,
            }),
        ).toBeNull();
        expect(await refusal(UpdatePersonRulesDto, {})).toBeNull();
    });

    it.each([2, 0, null])(
        "refuses their own free-cancel window (%s), saying why",
        async (freeCancelHours) => {
            expect(
                await refusal(UpdatePersonRulesDto, {
                    gapMinutes: 10,
                    freeCancelHours,
                }),
            ).toMatchObject({
                statusCode: 400,
                message: [PERSON_FREE_CANCEL_REFUSAL],
            });
        },
    );

    it("leaves the business's own free-cancel window to set", async () => {
        expect(
            await refusal(UpdateBookingRulesDto, { freeCancelHours: 24 }),
        ).toBeNull();
    });
});
