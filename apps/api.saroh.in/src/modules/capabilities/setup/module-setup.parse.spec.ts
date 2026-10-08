import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";

import { validationPipeOptions } from "../../../common/validation";
import { ModuleMutationDto } from "../dto";
import { parseModuleSetup } from "./module-setup.parse";

/**
 * The setup payload's shapes (DEC-068), without a database: what each module
 * accepts, and a refusal that names every field as `setup.<path>`.
 */

function refusal(fn: () => unknown): {
    message: string;
    details: { field: string; fields: { field: string; message: string }[] };
} {
    try {
        fn();
    } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        return (e as BadRequestException).getResponse() as never;
    }
    throw new Error("expected a refusal");
}

const HOURS = [{ weekday: 1, open: "10:00", close: "19:00" }];
const SERVICE = { name: "Haircut", durationMinutes: 45, price: "499.50" };

describe("the body: setup rides through the global pipe untouched", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const run = (value: unknown) =>
        pipe.transform(value, {
            type: "body",
            metatype: ModuleMutationDto,
        }) as Promise<ModuleMutationDto>;

    it("keeps setup's nested fields for the module's own check", async () => {
        const dto = await run({
            status: "ENABLED",
            setup: { hours: HOURS, service: SERVICE },
        });
        expect(dto.setup).toEqual({ hours: HOURS, service: SERVICE });
    });

    it("an enable without setup is valid as before", async () => {
        const dto = await run({ status: "ENABLED" });
        expect(dto.setup).toBeUndefined();
    });

    it("refuses a setup that isn't an object", async () => {
        await expect(
            run({ status: "ENABLED", setup: "yes" }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe("COMMERCE", () => {
    it("accepts a name and at least one way, trimmed", () => {
        expect(
            parseModuleSetup("COMMERCE", {
                storefrontName: "  Rye Bakery ",
                fulfilment: ["PICKUP", "SHIPPING"],
            }),
        ).toEqual({
            storefrontName: "Rye Bakery",
            fulfilment: ["PICKUP", "SHIPPING"],
        });
    });

    it("names every field it refuses", () => {
        const r = refusal(() =>
            parseModuleSetup("COMMERCE", {
                storefrontName: "x".repeat(81),
                fulfilment: [],
            }),
        );
        expect(r.details.fields.map((f) => f.field)).toEqual([
            "setup.storefrontName",
            "setup.fulfilment",
        ]);
        expect(r.details.field).toBe("setup.storefrontName");
        expect(r.message).toBe("Keep the name to 80 characters or fewer.");
    });

    it("refuses a way it doesn't know, and a way twice", () => {
        for (const fulfilment of [["DIGITAL"], ["PICKUP", "PICKUP"]]) {
            const r = refusal(() =>
                parseModuleSetup("COMMERCE", {
                    storefrontName: "Rye",
                    fulfilment,
                }),
            );
            expect(r.details.field).toBe("setup.fulfilment");
        }
    });

    it("refuses a blank name and a field it doesn't ask for", () => {
        const r = refusal(() =>
            parseModuleSetup("COMMERCE", {
                storefrontName: "   ",
                fulfilment: ["PICKUP"],
                slug: "rye",
            }),
        );
        expect(r.details.fields).toHaveLength(2);
        expect(r.details.fields).toEqual(
            expect.arrayContaining([
                {
                    field: "setup.storefrontName",
                    message: "Give your location a name.",
                },
                {
                    field: "setup.slug",
                    message: "This isn't something turning it on asks for.",
                },
            ]),
        );
    });
});

describe("APPOINTMENTS", () => {
    it("accepts hours and a first service; a blank price is no price", () => {
        const setup = parseModuleSetup("APPOINTMENTS", {
            hours: HOURS,
            service: { ...SERVICE, price: "" },
        });
        expect(setup.hours[0]).toEqual(HOURS[0]);
        expect(setup.service.price).toBe("");
    });

    it("names nested fields by their path", () => {
        const r = refusal(() =>
            parseModuleSetup("APPOINTMENTS", {
                hours: [
                    { weekday: 1, open: "10:00", close: "19:00" },
                    { weekday: 7, open: "9am", close: "19:00" },
                ],
                service: { name: "Cut", durationMinutes: 0, price: "4.999" },
            }),
        );
        expect(r.details.fields.map((f) => f.field)).toEqual([
            "setup.hours.1.weekday",
            "setup.hours.1.open",
            "setup.service.durationMinutes",
            "setup.service.price",
        ]);
    });

    it("refuses a window that closes before it opens", () => {
        const r = refusal(() =>
            parseModuleSetup("APPOINTMENTS", {
                hours: [{ weekday: 2, open: "19:00", close: "10:00" }],
                service: SERVICE,
            }),
        );
        expect(r.details).toEqual({
            field: "setup.hours.0.close",
            fields: [
                {
                    field: "setup.hours.0.close",
                    message: "Close after you open.",
                },
            ],
        });
    });

    it("needs a day open and a service", () => {
        const r = refusal(() =>
            parseModuleSetup("APPOINTMENTS", { hours: [] }),
        );
        expect(r.details.fields.map((f) => f.field)).toEqual([
            "setup.hours",
            "setup.service",
        ]);
    });

    it("takes whole minutes, never a string", () => {
        const r = refusal(() =>
            parseModuleSetup("APPOINTMENTS", {
                hours: HOURS,
                service: { ...SERVICE, durationMinutes: "45" },
            }),
        );
        expect(r.details.field).toBe("setup.service.durationMinutes");
    });
});

describe("WEBSITE", () => {
    it("accepts a name and an address, lower-cased", () => {
        expect(
            parseModuleSetup("WEBSITE", {
                siteName: "Rye",
                address: " Rye-Studio ",
            }),
        ).toEqual({ siteName: "Rye", address: "rye-studio" });
    });

    it("needs both", () => {
        const r = refusal(() => parseModuleSetup("WEBSITE", {}));
        expect(r.details.fields.map((f) => f.field)).toEqual([
            "setup.siteName",
            "setup.address",
        ]);
    });

    // The Turn on sheet's choice of template (industry templates U12).
    it("takes a template the catalogue has", () => {
        expect(
            parseModuleSetup("WEBSITE", {
                siteName: "Rye",
                address: "rye",
                templateId: "bakery",
            }),
        ).toEqual({ siteName: "Rye", address: "rye", templateId: "bakery" });
    });

    it("refuses one it doesn't, on the field", () => {
        const r = refusal(() =>
            parseModuleSetup("WEBSITE", {
                siteName: "Rye",
                address: "rye",
                templateId: "nope",
            }),
        );
        expect(r.message).toBe("Choose one of the templates offered.");
        expect(r.details.field).toBe("setup.templateId");
    });
});

describe("modules that ask nothing", () => {
    it.each([
        "CRM",
        "PAYMENTS",
        "COMMUNICATIONS",
        "INSIGHTS",
        "CLASS_PACKS",
        "COURSES",
        "AUTOMATIONS",
    ] as const)("%s takes {} and refuses anything in it", (key) => {
        expect(parseModuleSetup(key, {})).toEqual({});
        const r = refusal(() => parseModuleSetup(key, { provider: "x" }));
        expect(r.details.field).toBe("setup.provider");
    });

    it("refuses a setup that isn't an object", () => {
        for (const raw of [null, [], "x", 1]) {
            expect(
                refusal(() => parseModuleSetup("CRM", raw)).details.field,
            ).toBe("setup");
        }
    });
});
