// What a draft save may say about the version it was copied from, checked
// with the validator the global ValidationPipe runs. The rule itself (is it
// the newest published version?) is the service's: catalogue-writes.db.spec.
import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { SaveDraftDto } from "./dto";

async function refusedOn(body: Record<string, unknown>): Promise<string[]> {
    return (await validate(plainToInstance(SaveDraftDto, body))).map(
        (e) => e.property,
    );
}

const start = { catalog: {}, revision: 0 };

describe("a draft save's base version", () => {
    it("is a version number, or null when nothing is published", async () => {
        expect(await refusedOn({ ...start, baseVersion: 4 })).toEqual([]);
        expect(await refusedOn({ ...start, baseVersion: null })).toEqual([]);
    });

    it("may be left out by a later save, which names its revision", async () => {
        expect(await refusedOn({ catalog: {}, revision: 3 })).toEqual([]);
    });

    it("is never text, a fraction or version 0", async () => {
        for (const bad of ["4", 1.5, 0, -1, true]) {
            expect(await refusedOn({ ...start, baseVersion: bad })).toEqual([
                "baseVersion",
            ]);
        }
    });

    it("stays a null or a missing value through the transform", () => {
        // The service tells "nothing published" (null) from "didn't say"
        // (undefined, refused): the two must not be folded together.
        expect(
            plainToInstance(SaveDraftDto, { ...start, baseVersion: null })
                .baseVersion,
        ).toBeNull();
        expect(
            plainToInstance(SaveDraftDto, start).baseVersion,
        ).toBeUndefined();
    });
});
