import { describe, expect, it } from "vitest";

import {
    buildUploadInputSchema,
    DEFAULT_ALLOWED_CONTENT_TYPES,
    DEFAULT_MAX_UPLOAD_BYTES,
    extensionForContentType,
    isAllowedContentType,
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
