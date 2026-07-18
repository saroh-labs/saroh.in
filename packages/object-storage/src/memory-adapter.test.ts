import { describe, expect, it } from "vitest";

import { createMemoryStorage } from "./memory-adapter";
import type { ObjectStorage } from "./port";

function makeInput(overrides: Record<string, unknown> = {}) {
    return {
        organizationId: "org-1",
        contentType: "image/png",
        contentLength: 2048,
        filename: "photo.png",
        ...overrides,
    };
}

describe("createMemoryStorage", () => {
    it("mints a tenant-scoped key and well-formed upload URL", async () => {
        const storage = createMemoryStorage({ generateId: () => "fixed-id" });
        const result = await storage.createSignedUploadUrl(makeInput());

        expect(result.method).toBe("PUT");
        expect(result.key).toBe("org/org-1/fixed-id-photo.png");
        expect(result.headers["Content-Type"]).toBe("image/png");
        expect(result.headers["Content-Length"]).toBe("2048");
        expect(result.maxContentLength).toBe(2048);
        expect(() => new URL(result.url)).not.toThrow();
        expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(
            Date.now(),
        );
    });

    it("tracks stored keys and confirms them via headObject", async () => {
        const storage = createMemoryStorage({ generateId: () => "id-1" });
        const { key } = await storage.createSignedUploadUrl(makeInput());

        expect(storage.listKeys()).toContain(key);
        expect(storage.has(key)).toBe(true);

        const head = await storage.headObject(key);
        expect(head).not.toBeNull();
        expect(head?.contentType).toBe("image/png");
        expect(head?.contentLength).toBe(2048);
    });

    it("headObject resolves null for an unknown key", async () => {
        const storage = createMemoryStorage();
        expect(await storage.headObject("org/x/nope.png")).toBeNull();
    });

    it("deleteObject removes tracked state and is idempotent", async () => {
        const storage = createMemoryStorage({ generateId: () => "id-2" });
        const { key } = await storage.createSignedUploadUrl(makeInput());

        await storage.deleteObject(key);
        expect(storage.has(key)).toBe(false);
        await expect(storage.deleteObject(key)).resolves.toBeUndefined();
    });

    it("mints a well-formed download URL with expiry", async () => {
        const storage = createMemoryStorage();
        const dl = await storage.createSignedDownloadUrl("org/o/k.png", {
            expiresInSeconds: 120,
        });
        expect(dl.method).toBe("GET");
        expect(dl.key).toBe("org/o/k.png");
        expect(() => new URL(dl.url)).not.toThrow();
    });

    it("returns a stable public URL", () => {
        const storage = createMemoryStorage({
            publicBaseUrl: "https://cdn.test/",
        });
        expect(storage.getPublicUrl("org/o/k.png")).toBe(
            "https://cdn.test/org/o/k.png",
        );
    });

    it("enforces the allowlist and size cap at the boundary", async () => {
        const storage = createMemoryStorage({ maxUploadBytes: 1000 });
        await expect(
            storage.createSignedUploadUrl(
                makeInput({ contentType: "image/svg+xml" }),
            ),
        ).rejects.toThrow();
        await expect(
            storage.createSignedUploadUrl(makeInput({ contentLength: 5000 })),
        ).rejects.toThrow();
    });

    it("satisfies the ObjectStorage port shape", () => {
        const storage: ObjectStorage = createMemoryStorage();
        expect(typeof storage.createSignedUploadUrl).toBe("function");
        expect(typeof storage.createSignedDownloadUrl).toBe("function");
        expect(typeof storage.getPublicUrl).toBe("function");
        expect(typeof storage.deleteObject).toBe("function");
        expect(typeof storage.headObject).toBe("function");
    });
});
