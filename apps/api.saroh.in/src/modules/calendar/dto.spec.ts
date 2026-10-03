// What the calendar route accepts, checked with the global ValidationPipe's
// own options (`common/validation.ts`): `from`/`to`, and no longer the
// `month` alias the app before E20 sent (follow-up Z3).
import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";

import { validationPipeOptions } from "../../common/validation";
import { CalendarQueryDto } from "./dto";

const pipe = new ValidationPipe(validationPipeOptions);
const asQuery = (query: Record<string, string>) =>
    pipe.transform(query, { type: "query", metatype: CalendarQueryDto });

describe("the calendar's query", () => {
    it("takes from and to", async () => {
        await expect(
            asQuery({ from: "2026-09-01", to: "2026-09-30" }),
        ).resolves.toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    });

    it("refuses the removed month alias with a 400", async () => {
        const refusal = await asQuery({ month: "2026-09" }).catch(
            (e: unknown) => e,
        );
        expect(refusal).toBeInstanceOf(BadRequestException);
        expect(
            JSON.stringify((refusal as BadRequestException).getResponse()),
        ).toContain("property month should not exist");
    });
});
