import { BadRequestException } from "@nestjs/common";

import {
    assertUploadType,
    NOT_A_LOGO_MESSAGE,
    NOT_A_VIDEO_MESSAGE,
    NOT_AN_IMAGE_MESSAGE,
    NOTHING_UPLOADED_MESSAGE,
    storedBytesProblem,
} from "./upload-checks";

/*
 * The first bytes of real files: a 1×1 PNG and JPEG written by macOS `sips`,
 * and the smallest lossless WebP. Sixteen bytes is more than either check
 * reads (12).
 */
const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => new TextEncoder().encode(s);
const PNG = bytes(
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    0x0d,
    0x49,
    0x48,
    0x44,
    0x52,
);
const JPEG = bytes(
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x48,
);
const WEBP = bytes(
    0x52,
    0x49,
    0x46,
    0x46,
    0x1a,
    0,
    0,
    0,
    0x57,
    0x45,
    0x42,
    0x50,
    0x56,
    0x50,
    0x38,
    0x4c,
);
/** A note saved as text and renamed `logo.png`. */
const TEXT = ascii("Northwind Coffee, est. 2019\n");
const SVG = ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>');

const photo = (contentType: string, purpose: string | null = "site-image") => ({
    contentType,
    purpose,
});

describe("storedBytesProblem — the bytes are the image the upload said (#873)", () => {
    it.each([
        ["image/png", PNG],
        ["image/jpeg", JPEG],
        ["image/webp", WEBP],
    ])("passes a real %s", (type, start) => {
        expect(storedBytesProblem(photo(type), start, true)).toBeNull();
        expect(
            storedBytesProblem(photo(type, "business-logo"), start, true),
        ).toBeNull();
    });

    it("refuses a text file renamed .png, in plain words", () => {
        expect(storedBytesProblem(photo("image/png"), TEXT, true)).toBe(
            NOT_AN_IMAGE_MESSAGE,
        );
    });

    it("refuses an SVG sent as a PNG", () => {
        expect(storedBytesProblem(photo("image/png"), SVG, true)).toBe(
            NOT_AN_IMAGE_MESSAGE,
        );
    });

    it("refuses a real image of another type than the upload said", () => {
        expect(storedBytesProblem(photo("image/png"), JPEG, true)).toBe(
            NOT_AN_IMAGE_MESSAGE,
        );
        expect(storedBytesProblem(photo("image/webp"), PNG, true)).toBe(
            NOT_AN_IMAGE_MESSAGE,
        );
    });

    it("says a logo's refusal in the logo's own words", () => {
        expect(
            storedBytesProblem(photo("image/png", "business-logo"), TEXT, true),
        ).toBe(NOT_A_LOGO_MESSAGE);
    });

    it("refuses a photo nothing was stored for, where storage sees uploads", () => {
        expect(storedBytesProblem(photo("image/png"), null, true)).toBe(
            NOTHING_UPLOADED_MESSAGE,
        );
    });

    it("lets a photo through unread where storage never sees the upload", () => {
        expect(storedBytesProblem(photo("image/png"), null, false)).toBeNull();
    });

    it("never lets an unread video through", () => {
        expect(storedBytesProblem(photo("video/mp4"), null, false)).toBe(
            NOT_A_VIDEO_MESSAGE,
        );
    });
});

describe("assertUploadType — only images the screens can show (#873)", () => {
    const upload = (contentType: string, purpose?: string) => ({
        contentType,
        contentLength: 2048,
        filename: "file",
        purpose,
    });
    const refusal = (fn: () => void) => {
        try {
            fn();
        } catch (error) {
            expect(error).toBeInstanceOf(BadRequestException);
            return (error as BadRequestException).message;
        }
        return null;
    };

    it.each([
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/avif",
    ])("takes %s as a site image or product photo", (type) => {
        expect(refusal(() => assertUploadType(upload(type)))).toBeNull();
        expect(
            refusal(() => assertUploadType(upload(type, "site-image"))),
        ).toBeNull();
    });

    it.each(["image/svg+xml", "image/heic", "text/plain", "text/html"])(
        "refuses %s in plain words, not as a server error",
        (type) => {
            expect(refusal(() => assertUploadType(upload(type)))).toBe(
                NOT_AN_IMAGE_MESSAGE,
            );
        },
    );

    it("takes a PNG, JPG or WebP logo and nothing else", () => {
        for (const type of ["image/png", "image/jpeg", "image/webp"]) {
            expect(
                refusal(() => assertUploadType(upload(type, "business-logo"))),
            ).toBeNull();
        }
        for (const type of ["image/gif", "image/svg+xml", "text/plain"]) {
            expect(
                refusal(() => assertUploadType(upload(type, "business-logo"))),
            ).toBe(NOT_A_LOGO_MESSAGE);
        }
    });
});
