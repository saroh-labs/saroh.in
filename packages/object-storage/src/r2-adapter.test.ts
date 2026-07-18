import type {
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import type { ObjectStorage } from "./port";
import type { PresignOptions, Presigner, R2StorageConfig } from "./r2-adapter";
import { createR2Storage } from "./r2-adapter";

interface PresignCall {
    command: PutObjectCommand | GetObjectCommand;
    expiresIn: number | undefined;
}

function setup(overrides: Partial<R2StorageConfig> = {}) {
    const presignCalls: PresignCall[] = [];
    const presign: Presigner = (
        _client: S3Client,
        command: PutObjectCommand | GetObjectCommand,
        options: PresignOptions,
    ): Promise<string> => {
        presignCalls.push({ command, expiresIn: options.expiresIn });
        return Promise.resolve("https://signed.r2.test/object?sig=abc");
    };

    const storage = createR2Storage({
        endpoint: "https://acct.r2.cloudflarestorage.com",
        bucket: "media-bucket",
        accessKeyId: "key",
        secretAccessKey: "secret",
        publicBaseUrl: "https://cdn.saroh.test",
        s3Client: {} as unknown as S3Client,
        presign,
        ...overrides,
    });

    return { storage, presignCalls };
}

describe("createR2Storage — presigned upload", () => {
    it("presigns a PUT against the right bucket/key/type/length/expiry", async () => {
        const { storage, presignCalls } = setup({
            uploadExpirySeconds: 300,
        });

        const result = await storage.createSignedUploadUrl({
            organizationId: "org-9",
            contentType: "image/png",
            contentLength: 4096,
            filename: "../hero photo.PNG",
            purpose: "post-cover",
        });

        expect(result.url).toBe("https://signed.r2.test/object?sig=abc");
        expect(result.method).toBe("PUT");
        // Tenant-scoped, sanitized key (traversal + spaces removed, lowercased).
        expect(result.key).toMatch(
            /^org\/org-9\/post-cover\/[0-9a-f-]+-hero-photo\.png$/,
        );
        expect(result.headers["Content-Type"]).toBe("image/png");
        expect(result.headers["Content-Length"]).toBe("4096");

        expect(presignCalls).toHaveLength(1);
        const call = presignCalls[0];
        expect(call.expiresIn).toBe(300);
        const command = call.command;
        // Narrow the union to assert on the Put-only fields.
        expect(command.constructor.name).toBe("PutObjectCommand");
        const input = command.input as {
            Bucket?: string;
            Key?: string;
            ContentType?: string;
            ContentLength?: number;
        };
        expect(input.Bucket).toBe("media-bucket");
        expect(input.Key).toBe(result.key);
        expect(input.ContentType).toBe("image/png");
        expect(input.ContentLength).toBe(4096);
    });

    it("rejects a disallowed content type before presigning", async () => {
        const { storage, presignCalls } = setup();
        await expect(
            storage.createSignedUploadUrl({
                organizationId: "org-9",
                contentType: "image/svg+xml",
                contentLength: 100,
                filename: "x.svg",
            }),
        ).rejects.toThrow();
        expect(presignCalls).toHaveLength(0);
    });

    it("rejects an over-cap content length before presigning", async () => {
        const { storage, presignCalls } = setup({ maxUploadBytes: 1000 });
        await expect(
            storage.createSignedUploadUrl({
                organizationId: "org-9",
                contentType: "image/png",
                contentLength: 2000,
                filename: "big.png",
            }),
        ).rejects.toThrow();
        expect(presignCalls).toHaveLength(0);
    });
});

describe("createR2Storage — presigned download", () => {
    it("presigns a GET with the configured expiry", async () => {
        const { storage, presignCalls } = setup({ downloadExpirySeconds: 900 });
        const dl = await storage.createSignedDownloadUrl("org/o/k.png");

        expect(dl.method).toBe("GET");
        expect(dl.key).toBe("org/o/k.png");
        expect(presignCalls[0]?.expiresIn).toBe(900);
        const input = presignCalls[0]?.command.input as {
            Bucket?: string;
            Key?: string;
        };
        expect(input.Bucket).toBe("media-bucket");
        expect(input.Key).toBe("org/o/k.png");
    });

    it("honors a per-call expiry override", async () => {
        const { storage, presignCalls } = setup();
        await storage.createSignedDownloadUrl("org/o/k.png", {
            expiresInSeconds: 42,
        });
        expect(presignCalls[0]?.expiresIn).toBe(42);
    });
});

describe("createR2Storage — public url", () => {
    it("builds a CDN url from the public base", () => {
        const { storage } = setup();
        expect(storage.getPublicUrl("org/o/k.png")).toBe(
            "https://cdn.saroh.test/org/o/k.png",
        );
    });

    it("throws when no public base url is configured", () => {
        const { storage } = setup({ publicBaseUrl: undefined });
        expect(() => storage.getPublicUrl("org/o/k.png")).toThrow(
            /publicBaseUrl/,
        );
    });
});

describe("createR2Storage — head/delete via mocked S3 client", () => {
    it("headObject returns metadata from the client", async () => {
        const send = vi.fn().mockResolvedValue({
            ContentType: "image/png",
            ContentLength: 1234,
            ETag: '"etag-1"',
            $metadata: { httpStatusCode: 200 },
        });
        const { storage } = setup({
            s3Client: { send } as unknown as S3Client,
        });

        const head = await storage.headObject("org/o/k.png");
        expect(head).toEqual({
            key: "org/o/k.png",
            contentType: "image/png",
            contentLength: 1234,
            etag: '"etag-1"',
        });
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("headObject resolves null on a 404 / NotFound", async () => {
        const send = vi.fn().mockRejectedValue({
            name: "NotFound",
            $metadata: { httpStatusCode: 404 },
        });
        const { storage } = setup({
            s3Client: { send } as unknown as S3Client,
        });
        expect(await storage.headObject("org/o/missing.png")).toBeNull();
    });

    it("headObject rethrows non-404 errors", async () => {
        const send = vi.fn().mockRejectedValue({
            name: "AccessDenied",
            $metadata: { httpStatusCode: 403 },
        });
        const { storage } = setup({
            s3Client: { send } as unknown as S3Client,
        });
        await expect(storage.headObject("org/o/k.png")).rejects.toMatchObject({
            name: "AccessDenied",
        });
    });

    it("deleteObject sends a delete command", async () => {
        const send = vi.fn().mockResolvedValue({
            $metadata: { httpStatusCode: 204 },
        });
        const { storage } = setup({
            s3Client: { send } as unknown as S3Client,
        });
        await storage.deleteObject("org/o/k.png");
        expect(send).toHaveBeenCalledTimes(1);
    });
});

describe("createR2Storage — port shape", () => {
    it("satisfies the ObjectStorage interface", () => {
        const { storage } = setup();
        const asPort: ObjectStorage = storage;
        expect(typeof asPort.createSignedUploadUrl).toBe("function");
        expect(typeof asPort.createSignedDownloadUrl).toBe("function");
        expect(typeof asPort.getPublicUrl).toBe("function");
        expect(typeof asPort.deleteObject).toBe("function");
        expect(typeof asPort.headObject).toBe("function");
    });
});
