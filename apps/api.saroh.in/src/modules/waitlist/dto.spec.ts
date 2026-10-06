import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { JoinWaitlistDto } from "./dto";

/** The join's country: two letters the site adds, or nothing. */
async function check(country: unknown) {
    const dto = plainToInstance(JoinWaitlistDto, {
        email: "a@shop.in",
        business: "Glow Studio",
        kind: "salon",
        country,
    });
    const errors = await validate(dto);
    return { dto, fields: errors.map((e) => e.property) };
}

describe("JoinWaitlistDto country", () => {
    it("takes two letters, in capitals", async () => {
        const { dto, fields } = await check("in");
        expect(fields).toEqual([]);
        expect(dto.country).toBe("IN");
    });

    it("treats a blank as no country", async () => {
        const { dto, fields } = await check("  ");
        expect(fields).toEqual([]);
        expect(dto.country).toBeUndefined();
    });

    it("refuses anything that isn't a country code", async () => {
        for (const bad of ["IND", "I", "1N", "XX-YY", 42]) {
            expect((await check(bad)).fields).toEqual(["country"]);
        }
    });
});
