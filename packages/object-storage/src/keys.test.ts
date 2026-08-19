import { describe, expect, it } from "vitest";

import {
    buildObjectKey,
    sanitizeFilename,
    sanitizeSegment,
    stripTrailingSlashes,
} from "./keys";

describe("sanitizeFilename", () => {
    it("strips directory components and path traversal", () => {
        expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
        expect(sanitizeFilename("../secret.png")).toBe("secret.png");
        expect(sanitizeFilename("a/b/c/photo.JPG")).toBe("photo.jpg");
        expect(sanitizeFilename("C:\\Windows\\evil.exe")).toBe("evil.exe");
    });

    it("never yields a leading slash, dot, or `..`", () => {
        expect(sanitizeFilename("...hidden")).toBe("hidden");
        expect(sanitizeFilename(".env")).toBe("env");
        const out = sanitizeFilename("..\\..\\x");
        expect(out.startsWith("/")).toBe(false);
        expect(out.startsWith(".")).toBe(false);
        expect(out.includes("..")).toBe(false);
    });

    it("collapses unsafe characters to dashes", () => {
        expect(sanitizeFilename("my photo (final)!.png")).toBe(
            "my-photo-final-.png",
        );
    });

    it("falls back to `file` when nothing safe remains", () => {
        expect(sanitizeFilename("///")).toBe("file");
        expect(sanitizeFilename("....")).toBe("file");
    });
});

describe("sanitizeSegment", () => {
    it("reduces to [a-z0-9-]", () => {
        expect(sanitizeSegment("Org_123 ABC")).toBe("org-123-abc");
        expect(sanitizeSegment("  spaced  ")).toBe("spaced");
    });
});

describe("buildObjectKey", () => {
    it("produces a tenant-scoped key with no leading slash", () => {
        const key = buildObjectKey({
            organizationId: "org-abc",
            filename: "photo.png",
            uuid: "uuid-1",
        });
        expect(key).toBe("org/org-abc/uuid-1-photo.png");
        expect(key.startsWith("/")).toBe(false);
        expect(key.startsWith("org/org-abc/")).toBe(true);
    });

    it("namespaces different organizations apart", () => {
        const a = buildObjectKey({
            organizationId: "tenant-a",
            filename: "x.png",
            uuid: "u",
        });
        const b = buildObjectKey({
            organizationId: "tenant-b",
            filename: "x.png",
            uuid: "u",
        });
        expect(a).not.toBe(b);
        expect(a.startsWith("org/tenant-a/")).toBe(true);
        expect(b.startsWith("org/tenant-b/")).toBe(true);
    });

    it("inserts a sanitized purpose segment", () => {
        const key = buildObjectKey({
            organizationId: "org1",
            filename: "cover.webp",
            purpose: "Post Cover",
            uuid: "abc",
        });
        expect(key).toBe("org/org1/post-cover/abc-cover.webp");
    });

    it("cannot be escaped by a traversal filename", () => {
        const key = buildObjectKey({
            organizationId: "org1",
            filename: "../../../../root.png",
            uuid: "u",
        });
        expect(key).toBe("org/org1/u-root.png");
        expect(key.includes("..")).toBe(false);
    });

    it("throws when organizationId sanitizes to empty", () => {
        expect(() =>
            buildObjectKey({
                organizationId: "   ",
                filename: "x.png",
                uuid: "u",
            }),
        ).toThrow(/organizationId/);
    });
});

describe("stripTrailingSlashes", () => {
    it("removes a trailing slash run and leaves everything else alone", () => {
        expect(stripTrailingSlashes("https://cdn.example.com")).toBe(
            "https://cdn.example.com",
        );
        expect(stripTrailingSlashes("https://cdn.example.com/")).toBe(
            "https://cdn.example.com",
        );
        expect(stripTrailingSlashes("https://cdn.example.com///")).toBe(
            "https://cdn.example.com",
        );
        expect(stripTrailingSlashes("https://cdn.example.com/a//b/")).toBe(
            "https://cdn.example.com/a//b",
        );
        expect(stripTrailingSlashes("")).toBe("");
        expect(stripTrailingSlashes("////")).toBe("");
    });

    // Regression: the /\/+$/ this replaced backtracked quadratically, taking
    // >1s on this input (CodeQL js/polynomial-redos).
    it("stays linear on a slash-heavy string", () => {
        const hostile = `x${"/".repeat(200_000)}y`;
        const started = performance.now();
        expect(stripTrailingSlashes(hostile)).toBe(hostile);
        expect(performance.now() - started).toBeLessThan(250);
    });
});
