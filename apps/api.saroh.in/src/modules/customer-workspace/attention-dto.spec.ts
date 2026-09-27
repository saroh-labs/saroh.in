import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";

import { validationPipeOptions } from "../../common/validation";
import { CreateAttentionDto, UpdateAttentionDto } from "./dto";

/**
 * A Needs attention entry at the boundary (C1): one of four kinds, a short
 * label, a detail that a blank clears, and nothing else.
 */
const pipe = new ValidationPipe(validationPipeOptions);
const create = (value: unknown) =>
    pipe.transform(value, { type: "body", metatype: CreateAttentionDto });
const update = (value: unknown) =>
    pipe.transform(value, { type: "body", metatype: UpdateAttentionDto });

describe("Needs attention DTOs", () => {
    it("takes the four kinds, trimmed labels and a detail", async () => {
        for (const kind of ["ALLERGY", "MEDICAL", "ACCESS", "OTHER"]) {
            await expect(
                create({ kind, label: " Ramp " }),
            ).resolves.toMatchObject({ kind, label: "Ramp" });
        }
        await expect(
            create({ kind: "OTHER", label: "VIP", detail: "  " }),
        ).resolves.toMatchObject({ detail: null });
    });

    it("refuses an unknown kind, a missing kind and a stray field", async () => {
        await expect(
            create({ kind: "DIET", label: "Vegan" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(create({ label: "Vegan" })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(
            create({ kind: "OTHER", label: "VIP", source: "CUSTOMER" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(update({ status: "ACTIVE" })).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it("keeps a label to 60 characters and a detail to 500", async () => {
        await expect(
            create({ kind: "OTHER", label: "x".repeat(60) }),
        ).resolves.toBeDefined();
        await expect(
            create({ kind: "OTHER", label: "x".repeat(61) }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            update({ detail: "x".repeat(501) }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("lets an update clear the allergen with null", async () => {
        await expect(update({ allergenId: null })).resolves.toMatchObject({
            allergenId: null,
        });
    });
});
