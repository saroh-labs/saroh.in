import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { IsBoolean } from "class-validator";

import { validationPipeOptions } from "../../common/validation";
import {
    SetCommentResolvedDto,
    UpdateDraftSectionsDto,
    UpdatePageDto,
} from "./dto";

/**
 * What `PATCH :siteId/comments/:commentId` accepts (#286), checked through the
 * API's real ValidationPipe options rather than by calling the service
 * directly.
 */
const pipe = new ValidationPipe(validationPipeOptions);

function asBody(metatype: new (...args: never[]) => unknown) {
    return { type: "body" as const, metatype };
}

/** The obvious DTO, without the raw-value transform, to show why it is needed. */
class NaiveResolvedDto {
    @IsBoolean()
    resolved!: boolean;
}

describe("the comments PATCH body (#286)", () => {
    it("accepts a real boolean, either way", async () => {
        await expect(
            pipe.transform({ resolved: true }, asBody(SetCommentResolvedDto)),
        ).resolves.toMatchObject({ resolved: true });
        await expect(
            pipe.transform({ resolved: false }, asBody(SetCommentResolvedDto)),
        ).resolves.toMatchObject({ resolved: false });
    });

    it.each([
        ['the string "true"', { resolved: "true" }],
        ['the string "false"', { resolved: "false" }],
        ["the number 1", { resolved: 1 }],
        ["no value at all", {}],
        ["a field it does not accept", { resolved: true, resolvedBy: "u" }],
    ])("refuses %s with a 400", async (_label, body) => {
        await expect(
            pipe.transform(body, asBody(SetCommentResolvedDto)),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('needs the raw-value transform: implicit conversion alone turns "false" into true', async () => {
        const out = (await pipe.transform(
            { resolved: "false" },
            asBody(NaiveResolvedDto),
        )) as NaiveResolvedDto;
        expect(out.resolved).toBe(true);
    });

    it("validates nothing for an inline body type, which is why the route had to change", async () => {
        await expect(
            pipe.transform({ resolved: "true", anything: 1 }, asBody(Object)),
        ).resolves.toEqual({ resolved: "true", anything: 1 });
    });
});

describe("a hidden flag must be a real boolean (#286)", () => {
    it('refuses "false" for a section, which conversion would read as hidden', async () => {
        await expect(
            pipe.transform(
                {
                    sections: [
                        {
                            type: "hero",
                            contractVersion: 1,
                            content: { heading: "Northwind" },
                            hidden: "false",
                        },
                    ],
                },
                asBody(UpdateDraftSectionsDto),
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("accepts a section with a real boolean, or no flag at all", async () => {
        await expect(
            pipe.transform(
                {
                    sections: [
                        {
                            type: "hero",
                            contractVersion: 1,
                            content: { heading: "Northwind" },
                            hidden: false,
                        },
                        {
                            type: "hero",
                            contractVersion: 1,
                            content: { heading: "Parked" },
                        },
                    ],
                },
                asBody(UpdateDraftSectionsDto),
            ),
        ).resolves.toBeDefined();
    });

    it('refuses "false" for a page, and accepts false', async () => {
        await expect(
            pipe.transform({ hidden: "false" }, asBody(UpdatePageDto)),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            pipe.transform({ hidden: false }, asBody(UpdatePageDto)),
        ).resolves.toMatchObject({ hidden: false });
    });
});
