// What the business settings route accepts, checked with the same validator
// the global ValidationPipe runs.
import "reflect-metadata";

import type { BadRequestException } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { validationPipeOptions } from "../../common/validation";
import {
    BUSINESS_TYPES,
    BusinessProfileDto,
    InvoiceNumberFormatDto,
    OnboardingProfileDto,
    OnboardOrganizationDto,
    UpdateOrganizationDto,
} from "./dto";

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

describe("a business profile's type (F10)", () => {
    const messages = async (body: unknown) =>
        (await validate(plainToInstance(BusinessProfileDto, body))).flatMap(
            (e) => Object.values(e.constraints ?? {}),
        );

    it("takes each of the six types", async () => {
        for (const type of BUSINESS_TYPES) {
            expect(await refused({ type })).toEqual([]);
        }
        expect(BUSINESS_TYPES).toEqual([
            "individual",
            "partnership",
            "llp",
            "pvt",
            "public",
            "trust",
        ]);
    });

    it("takes an old client's company for one more release (Z4 removes it)", async () => {
        expect(await refused({ type: "company" })).toEqual([]);
    });

    it("takes a type in any case, and an empty one as Not set", async () => {
        expect(await refused({ type: " LLP " })).toEqual([]);
        expect(await refused({ type: "" })).toEqual([]);
        expect(await refused({})).toEqual([]);
    });

    it('refuses an unknown type with "Unknown business type"', async () => {
        expect(await refused({ type: "cooperative" })).toEqual(["type"]);
        expect(await messages({ type: "cooperative" })).toEqual([
            "Unknown business type",
        ]);
        expect(await refused({ type: 3 })).toEqual(["type"]);
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

describe("what is being set up (DEC-070)", () => {
    // Through the API's own ValidationPipe, as a request would be.
    const pipe = new ValidationPipe(validationPipeOptions);
    const refusal = async (metatype: new () => object, body: unknown) =>
        pipe
            .transform(body, { type: "body", metatype })
            .then(() => null)
            .catch((e: BadRequestException) => e.getResponse());

    it.each(["BUSINESS", "SOLO", "WORK"])(
        "takes %s at setup and in settings",
        async (kind) => {
            expect(
                await refusal(OnboardOrganizationDto, { name: "Asha", kind }),
            ).toBeNull();
            expect(await refusal(UpdateOrganizationDto, { kind })).toBeNull();
        },
    );

    it("takes no kind at all, as an older app sends", async () => {
        expect(
            await refusal(OnboardOrganizationDto, { name: "Asha" }),
        ).toBeNull();
        expect(await refusal(UpdateOrganizationDto, {})).toBeNull();
    });

    it("refuses one it does not know with a 400 naming kind", async () => {
        for (const dto of [OnboardOrganizationDto, UpdateOrganizationDto]) {
            const response = await refusal(dto, {
                name: "Asha",
                kind: "SHOP",
            });
            expect(response).toMatchObject({ statusCode: 400 });
            expect(JSON.stringify(response)).toContain("kind must be");
        }
    });
});

describe('setup\'s "Is it registered?" (prelaunch)', () => {
    const errors = async (body: unknown) =>
        (await validate(plainToInstance(OnboardingProfileDto, body))).map(
            (e) => e.property,
        );

    it("takes a yes or a no, or nothing", async () => {
        expect(await errors({ registered: true })).toEqual([]);
        expect(await errors({ registered: false })).toEqual([]);
        expect(await errors({})).toEqual([]);
    });

    it("refuses anything that isn't a yes or a no", async () => {
        expect(await errors({ registered: "yes" })).toEqual(["registered"]);
    });

    it("is setup's alone: Settings refuses it, as any unknown field", async () => {
        const pipe = new ValidationPipe(validationPipeOptions);
        const through = (metatype: new () => object, body: unknown) =>
            pipe
                .transform(body, { type: "body", metatype })
                .then(() => null)
                .catch((e: BadRequestException) => e.getResponse());
        expect(
            await through(OnboardOrganizationDto, {
                name: "Asha",
                profile: { registered: true },
            }),
        ).toBeNull();
        expect(
            await through(UpdateOrganizationDto, {
                profile: { registered: true },
            }),
        ).toMatchObject({ statusCode: 400 });
    });
});
