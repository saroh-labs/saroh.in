// What the business settings route accepts, checked with the same validator
// the global ValidationPipe runs.
import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { BusinessProfileDto } from "./dto";

async function refused(body: unknown): Promise<string[]> {
    return (await validate(plainToInstance(BusinessProfileDto, body))).map(
        (e) => e.property,
    );
}

describe("a business profile's contact details", () => {
    it("takes a real email and website", async () => {
        expect(
            await refused({
                contactEmail: "hello@ryeandco.example.in",
                website: "https://ryeandco.example.in",
            }),
        ).toEqual([]);
    });

    it("takes an empty email or website as clearing it", async () => {
        expect(await refused({ contactEmail: "", website: "" })).toEqual([]);
    });

    it("leaves them alone when they are not sent", async () => {
        expect(await refused({})).toEqual([]);
    });

    it("refuses one that is neither empty nor valid", async () => {
        expect(
            (
                await refused({ contactEmail: "nope", website: "not a url" })
            ).sort(),
        ).toEqual(["contactEmail", "website"]);
    });
});
