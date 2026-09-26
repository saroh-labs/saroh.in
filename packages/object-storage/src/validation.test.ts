import { describe, expect, it } from "vitest";

import {
    buildUploadInputSchema,
    DEFAULT_ALLOWED_CONTENT_TYPES,
    DEFAULT_MAX_UPLOAD_BYTES,
    DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
    extensionForContentType,
    hasIsoBmffSignature,
    isAllowedContentType,
    isVideoContentType,
    VIDEO_CONTENT_TYPES,
    VIDEO_UPLOAD_PURPOSE,
} from "./validation";

describe("content-type allowlist", () => {
    it("accepts allowed image and doc types", () => {
        expect(
            isAllowedContentType("image/png", DEFAULT_ALLOWED_CONTENT_TYPES),
        ).toBe(true);
        expect(
            isAllowedContentType(
                "application/pdf",
                DEFAULT_ALLOWED_CONTENT_TYPES,
            ),
        ).toBe(true);
    });

    it("rejects disallowed types (incl. scriptable svg and executables)", () => {
        expect(
            isAllowedContentType(
                "image/svg+xml",
                DEFAULT_ALLOWED_CONTENT_TYPES,
            ),
        ).toBe(false);
        expect(
            isAllowedContentType(
                "application/x-msdownload",
                DEFAULT_ALLOWED_CONTENT_TYPES,
            ),
        ).toBe(false);
        expect(
            isAllowedContentType("text/html", DEFAULT_ALLOWED_CONTENT_TYPES),
        ).toBe(false);
    });

    it("maps allowed types to a canonical extension", () => {
        expect(
            extensionForContentType(
                "image/jpeg",
                DEFAULT_ALLOWED_CONTENT_TYPES,
            ),
        ).toBe("jpg");
        expect(
            extensionForContentType(
                "image/svg+xml",
                DEFAULT_ALLOWED_CONTENT_TYPES,
            ),
        ).toBeUndefined();
    });
});

describe("upload input schema", () => {
    const schema = buildUploadInputSchema({
        allowlist: DEFAULT_ALLOWED_CONTENT_TYPES,
        maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
    });

    it("accepts a valid input", () => {
        const result = schema.safeParse({
            organizationId: "org-1",
            contentType: "image/png",
            contentLength: 1024,
            filename: "photo.png",
            purpose: "avatar",
        });
        expect(result.success).toBe(true);
    });

    it("rejects a disallowed content type", () => {
        const result = schema.safeParse({
            organizationId: "org-1",
            contentType: "image/svg+xml",
            contentLength: 1024,
            filename: "x.svg",
        });
        expect(result.success).toBe(false);
    });

    it("rejects an over-cap content length", () => {
        const result = schema.safeParse({
            organizationId: "org-1",
            contentType: "image/png",
            contentLength: DEFAULT_MAX_UPLOAD_BYTES + 1,
            filename: "big.png",
        });
        expect(result.success).toBe(false);
    });

    it("rejects a zero / negative / non-integer content length", () => {
        for (const contentLength of [0, -5, 12.5]) {
            const result = schema.safeParse({
                organizationId: "org-1",
                contentType: "image/png",
                contentLength,
                filename: "x.png",
            });
            expect(result.success).toBe(false);
        }
    });

    it("requires a non-empty organizationId and filename", () => {
        expect(
            schema.safeParse({
                organizationId: "",
                contentType: "image/png",
                contentLength: 10,
                filename: "x.png",
            }).success,
        ).toBe(false);
        expect(
            schema.safeParse({
                organizationId: "org-1",
                contentType: "image/png",
                contentLength: 10,
                filename: "",
            }).success,
        ).toBe(false);
    });

    it("respects a custom, narrower allowlist", () => {
        const narrow = buildUploadInputSchema({
            allowlist: { "image/webp": "webp" },
            maxUploadBytes: 1000,
        });
        expect(
            narrow.safeParse({
                organizationId: "o",
                contentType: "image/png",
                contentLength: 10,
                filename: "x.png",
            }).success,
        ).toBe(false);
        expect(
            narrow.safeParse({
                organizationId: "o",
                contentType: "image/webp",
                contentLength: 10,
                filename: "x.webp",
            }).success,
        ).toBe(true);
    });
});

describe("videos (#517)", () => {
    const schema = buildUploadInputSchema({
        allowlist: DEFAULT_ALLOWED_CONTENT_TYPES,
        maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
    });
    const video = (over: Record<string, unknown> = {}) => ({
        organizationId: "org-1",
        contentType: "video/mp4",
        contentLength: 40 * 1024 * 1024,
        filename: "pour.mp4",
        purpose: VIDEO_UPLOAD_PURPOSE,
        ...over,
    });

    it("accepts an MP4 or a MOV up to 50 MB under the video purpose", () => {
        expect(schema.safeParse(video()).success).toBe(true);
        expect(
            schema.safeParse(
                video({
                    contentType: "video/quicktime",
                    filename: "pour.mov",
                    contentLength: DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
                }),
            ).success,
        ).toBe(true);
    });

    it("refuses a 60 MB video", () => {
        expect(
            schema.safeParse(video({ contentLength: 60 * 1024 * 1024 }))
                .success,
        ).toBe(false);
    });

    it("refuses a video under any other purpose, and other video types", () => {
        expect(schema.safeParse(video({ purpose: "site-image" })).success).toBe(
            false,
        );
        expect(schema.safeParse(video({ purpose: undefined })).success).toBe(
            false,
        );
        expect(
            schema.safeParse(video({ contentType: "video/webm" })).success,
        ).toBe(false);
    });

    it("keeps the 25 MB cap for a photo, whatever its purpose", () => {
        expect(
            schema.safeParse(
                video({
                    contentType: "image/jpeg",
                    filename: "big.jpg",
                    contentLength: DEFAULT_MAX_UPLOAD_BYTES + 1,
                }),
            ).success,
        ).toBe(false);
    });

    it("knows the video types", () => {
        expect(isVideoContentType("video/mp4")).toBe(true);
        expect(isVideoContentType("video/quicktime")).toBe(true);
        expect(isVideoContentType("image/png")).toBe(false);
        expect(Object.keys(VIDEO_CONTENT_TYPES)).toEqual([
            "video/mp4",
            "video/quicktime",
        ]);
    });
});

describe("hasIsoBmffSignature", () => {
    const bytes = (...parts: (number[] | string)[]) =>
        new Uint8Array(
            parts.flatMap((p) =>
                typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p,
            ),
        );

    it("accepts an MP4 and a MOV ftyp box", () => {
        expect(hasIsoBmffSignature(bytes([0, 0, 0, 0x20], "ftypisom"))).toBe(
            true,
        );
        expect(hasIsoBmffSignature(bytes([0, 0, 0, 0x14], "ftypqt  "))).toBe(
            true,
        );
    });

    it("refuses a file that only says it is a video", () => {
        expect(hasIsoBmffSignature(bytes("<!doctype html>"))).toBe(false);
        expect(hasIsoBmffSignature(bytes([0, 0, 0, 0x20], "moovabcd"))).toBe(
            false,
        );
        expect(hasIsoBmffSignature(bytes([0, 0, 0, 4], "ftypisom"))).toBe(
            false,
        );
        expect(hasIsoBmffSignature(bytes([0, 0, 0, 0x20], "ftyp"))).toBe(false);
    });
});
