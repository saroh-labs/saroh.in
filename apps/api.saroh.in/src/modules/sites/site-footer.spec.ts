import { BadRequestException } from "@nestjs/common";

import { FOOTER_MAX_LENGTH, parseSiteFooter } from "./site-footer";

describe("parseSiteFooter", () => {
    it("keeps what the merchant wrote, with html as the default format", () => {
        expect(parseSiteFooter({ value: "<p>Northwind Supply</p>" })).toEqual({
            format: "html",
            value: "<p>Northwind Supply</p>",
        });
        expect(
            parseSiteFooter({ format: "markdown", value: "Northwind Supply" }),
        ).toEqual({ format: "markdown", value: "Northwind Supply" });
    });

    it("treats an empty or whitespace-only footer as no footer at all", () => {
        // Rendering an empty band in the merchant's footer colour because they
        // cleared the box is the same over-claim as rendering an absent price
        // as zero. Clearing the field IS how a footer is removed, so there is
        // no separate delete to find.
        expect(parseSiteFooter(null)).toBeNull();
        expect(parseSiteFooter(undefined)).toBeNull();
        expect(parseSiteFooter({ value: "" })).toBeNull();
        expect(parseSiteFooter({ value: "   \n\t " })).toBeNull();
    });

    it("rejects a malformed shape rather than quietly storing nothing", () => {
        // A client sending the wrong thing has a bug. Dropping it silently
        // would hide that until a merchant noticed their footer had never
        // saved — the same reasoning parseSiteStyle follows.
        expect(() => parseSiteFooter("just a string")).toThrow(
            BadRequestException,
        );
        expect(() => parseSiteFooter([{ value: "x" }])).toThrow(
            BadRequestException,
        );
        expect(() => parseSiteFooter({ value: 42 })).toThrow(
            BadRequestException,
        );
        expect(() => parseSiteFooter({ format: "mdx", value: "x" })).toThrow(
            BadRequestException,
        );
    });

    it("bounds the length so a footer stays a footer", () => {
        const ok = "a".repeat(FOOTER_MAX_LENGTH);
        expect(parseSiteFooter({ value: ok })?.value).toHaveLength(
            FOOTER_MAX_LENGTH,
        );
        expect(() =>
            parseSiteFooter({ value: "a".repeat(FOOTER_MAX_LENGTH + 1) }),
        ).toThrow(BadRequestException);
    });
});
