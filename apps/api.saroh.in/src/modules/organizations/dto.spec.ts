// What the business settings route accepts, checked with the same validator
// the global ValidationPipe runs.
import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { BusinessProfileDto, InvoiceNumberFormatDto } from "./dto";

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

describe("an invoice number format's shape", () => {
    const refusedFormat = async (body: unknown) =>
        (await validate(plainToInstance(InvoiceNumberFormatDto, body))).map(
            (e) => e.property,
        );
    const ok = {
        parts: ["PREFIX", "FY"],
        separator: "/",
        digits: 4,
        restart: "FY",
    };

    it("takes a format built from known parts", async () => {
        expect(await refusedFormat(ok)).toEqual([]);
        expect(await refusedFormat({ ...ok, parts: [] })).toEqual([]);
    });

    it("refuses a part twice or a part it does not know", async () => {
        expect(await refusedFormat({ ...ok, parts: ["FY", "FY"] })).toEqual([
            "parts",
        ]);
        expect(await refusedFormat({ ...ok, parts: ["DAY"] })).toEqual([
            "parts",
        ]);
    });

    it("refuses a counter outside 3 to 6 digits, or not whole", async () => {
        for (const digits of [2, 7, 4.5, "4"]) {
            expect(await refusedFormat({ ...ok, digits })).toEqual(["digits"]);
        }
    });

    it("takes the short financial year and no separator", async () => {
        expect(
            await refusedFormat({
                ...ok,
                parts: ["PREFIX", "FY_SHORT", "MONTH"],
                separator: "",
            }),
        ).toEqual([]);
    });

    it("refuses another separator or restart", async () => {
        expect(await refusedFormat({ ...ok, separator: "." })).toEqual([
            "separator",
        ]);
        expect(await refusedFormat({ ...ok, separator: " " })).toEqual([
            "separator",
        ]);
        expect(await refusedFormat({ ...ok, separator: undefined })).toEqual([
            "separator",
        ]);
        expect(await refusedFormat({ ...ok, restart: "WEEK" })).toEqual([
            "restart",
        ]);
    });
});
