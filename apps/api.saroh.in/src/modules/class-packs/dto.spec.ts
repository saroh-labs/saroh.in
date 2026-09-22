// What the class-pack routes accept, checked with the same validator the
// global ValidationPipe runs. The service decides the rest.
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { PackInputDto, SellPackDto, UsePackDto } from "./dto";

async function refused<T extends object>(
    cls: new () => T,
    body: unknown,
): Promise<string[]> {
    return (await validate(plainToInstance(cls, body))).map((e) => e.property);
}

describe("what a class pack accepts", () => {
    it("takes a whole pack", async () => {
        expect(
            await refused(PackInputDto, {
                name: " 10-class pack ",
                credits: 10,
                validityDays: 90,
                price: "4500.00",
                currency: "inr",
                serviceIds: ["svc_1"],
            }),
        ).toEqual([]);
    });

    it("trims the name and upper-cases the currency", () => {
        const dto = plainToInstance(PackInputDto, {
            name: "  Drop-in  ",
            currency: " inr ",
        });
        expect(dto.name).toBe("Drop-in");
        expect(dto.currency).toBe("INR");
    });

    it("refuses no classes, no days, or a fraction of a class", async () => {
        expect(await refused(PackInputDto, { credits: 0 })).toContain(
            "credits",
        );
        expect(await refused(PackInputDto, { credits: 1.5 })).toContain(
            "credits",
        );
        expect(await refused(PackInputDto, { validityDays: 0 })).toContain(
            "validityDays",
        );
    });

    it("refuses a price with three decimals, or a negative one", async () => {
        expect(await refused(PackInputDto, { price: "10.005" })).toContain(
            "price",
        );
        expect(await refused(PackInputDto, { price: "-10" })).toContain(
            "price",
        );
    });

    it("refuses a blank name and a currency that is not three letters", async () => {
        expect(await refused(PackInputDto, { name: "   " })).toContain("name");
        expect(await refused(PackInputDto, { currency: "RUPEE" })).toContain(
            "currency",
        );
    });

    it("needs someone to sell to", async () => {
        expect(await refused(SellPackDto, {})).toContain("contactId");
    });

    it("lets a pack be named or left to the soonest to expire", async () => {
        expect(await refused(UsePackDto, {})).toEqual([]);
        expect(await refused(UsePackDto, { packPurchaseId: "pp_1" })).toEqual(
            [],
        );
        expect(
            await refused(UsePackDto, { packPurchaseId: "x".repeat(65) }),
        ).toContain("packPurchaseId");
    });
});
