import { BadRequestException } from "@nestjs/common";

import {
    FOOTER_LAYOUTS,
    FOOTER_MAX_LENGTH,
    footerAfterUpdate,
    parseSiteFooter,
} from "./site-footer";

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

describe("the footer's layout (industry templates)", () => {
    it("keeps left, and stores centre as no layout", () => {
        expect(
            parseSiteFooter({ format: "markdown", value: "x", layout: "left" }),
        ).toEqual({ format: "markdown", value: "x", layout: "left" });
        expect(
            parseSiteFooter({
                format: "markdown",
                value: "x",
                layout: "centre",
            }),
        ).toEqual({ format: "markdown", value: "x" });
    });

    it("keeps a left footer with no line, and refuses an unknown layout", () => {
        expect(
            parseSiteFooter({ format: "html", value: " ", layout: "left" }),
        ).toEqual({ format: "html", value: "", layout: "left" });
        expect(() => parseSiteFooter({ value: "x", layout: "right" })).toThrow(
            BadRequestException,
        );
    });

    it("is the same list the renderer draws", () => {
        // `FOOTER_LAYOUTS` in site-blocks; the API does not import the
        // renderer, so the two lists are held equal here.
        expect(FOOTER_LAYOUTS).toEqual(["centre", "left"]);
    });
});

describe("footerAfterUpdate", () => {
    const stored = { format: "markdown", value: "Old line", layout: "left" };

    it("keeps the stored layout when the update sends only the line", () => {
        expect(
            footerAfterUpdate({ format: "markdown", value: "New" }, stored),
        ).toEqual({ format: "markdown", value: "New", layout: "left" });
    });

    it("keeps the row when the line is cleared", () => {
        expect(footerAfterUpdate(null, stored)).toEqual({
            format: "markdown",
            value: "",
            layout: "left",
        });
    });

    it("follows a layout the update names", () => {
        expect(
            footerAfterUpdate(
                { format: "markdown", value: "New", layout: "centre" },
                stored,
            ),
        ).toEqual({ format: "markdown", value: "New" });
    });

    it("is the update itself for a centred or broken stored footer", () => {
        expect(footerAfterUpdate(null, { value: "x" })).toBeNull();
        expect(footerAfterUpdate({ value: "y" }, "garbage")).toEqual({
            format: "html",
            value: "y",
        });
    });
});
