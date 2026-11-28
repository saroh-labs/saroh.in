import { BadRequestException } from "@nestjs/common";

import { NulPipe } from "./nul.pipe";

describe("NulPipe (I-1)", () => {
    const pipe = new NulPipe();

    it("refuses a NUL in a query, body or path value, naming the field", () => {
        expect(() =>
            pipe.transform({ q: "ro\u0000se" }, { type: "query" }),
        ).toThrow(
            new BadRequestException(
                "query.q: Must not contain a NUL character",
            ),
        );
        expect(() =>
            pipe.transform({ items: [{ name: "a\u0000" }] }, { type: "body" }),
        ).toThrow("body.items.0.name");
        expect(() => pipe.transform("id\u0000", { type: "param" })).toThrow(
            BadRequestException,
        );
    });

    it("passes everything else through untouched", () => {
        const value = { q: "rose", page: 2 };
        expect(pipe.transform(value, { type: "query" })).toBe(value);
        expect(pipe.transform("x\u0000", { type: "custom" })).toBe("x\u0000");
    });
});
