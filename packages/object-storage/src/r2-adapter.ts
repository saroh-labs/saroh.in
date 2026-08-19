import { randomUUID } from "node:crypto";

import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { buildObjectKey, stripTrailingSlashes } from "./keys";
import type {
    ContentTypeAllowlist,
    CreateSignedUploadUrlInput,
    HeadObjectResult,
    ObjectStorage,
    SignedDownloadUrl,
    SignedDownloadUrlOptions,
    SignedUploadUrl,
} from "./port";
import {
    buildUploadInputSchema,
    DEFAULT_ALLOWED_CONTENT_TYPES,
    DEFAULT_MAX_UPLOAD_BYTES,
} from "./validation";

/**
 * Config for the Cloudflare R2 adapter. Everything is PASSED IN by the app from
 * its own typed/validated env — this package never reads `process.env`. R2 is
 * S3-compatible, so this is standard S3 config plus a public CDN base.
 */
export interface R2StorageConfig {
    /** Account endpoint, e.g. `https://<accountid>.r2.cloudflarestorage.com`. */
    endpoint: string;
    /** Bucket name. */
    bucket: string;
    /** R2 access key id. */
    accessKeyId: string;
    /** R2 secret access key. */
    secretAccessKey: string;
    /** R2 uses a virtual region; defaults to `"auto"`. */
    region?: string;
    /**
     * Public CDN base (e.g. `https://cdn.example.com` or the r2.dev domain) for
     * `getPublicUrl`. When omitted, `getPublicUrl` throws.
     */
    publicBaseUrl?: string;
    /** Content-type allowlist; defaults to {@link DEFAULT_ALLOWED_CONTENT_TYPES}. */
    allowedContentTypes?: ContentTypeAllowlist;
    /** Upload byte cap; defaults to {@link DEFAULT_MAX_UPLOAD_BYTES}. */
    maxUploadBytes?: number;
    /** Presigned upload (PUT) URL lifetime; defaults to 600s. */
    uploadExpirySeconds?: number;
    /** Presigned download (GET) URL lifetime; defaults to 900s. */
    downloadExpirySeconds?: number;
    /**
     * Injectable S3 client (tests pass a fake). When omitted an `S3Client` is
     * constructed from the config above.
     */
    s3Client?: S3Client;
    /**
     * Injectable presigner (tests assert on the command/expiry without hitting
     * the network). Defaults to `@aws-sdk/s3-request-presigner`'s `getSignedUrl`.
     */
    presign?: Presigner;
}

/** Presigning options subset this package uses (superset accepted, e.g. by the SDK). */
export interface PresignOptions {
    expiresIn?: number;
}

/** Signature of the injectable presigner. */
export type Presigner = (
    client: S3Client,
    command: PutObjectCommand | GetObjectCommand,
    options: PresignOptions,
) => Promise<string>;

/** Default presigner — delegates to the S3 request presigner. */
const defaultPresigner: Presigner = (client, command, options) =>
    getSignedUrl(client, command, options);

const DEFAULT_UPLOAD_EXPIRY_SECONDS = 600;
const DEFAULT_DOWNLOAD_EXPIRY_SECONDS = 900;

function isNotFound(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const name = (error as { name?: string }).name;
    const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
    return name === "NotFound" || name === "NoSuchKey" || status === 404;
}

/**
 * Create an {@link ObjectStorage} backed by Cloudflare R2 (via the S3 SDK).
 *
 * Keys are always tenant-scoped and server-derived (see {@link buildObjectKey}).
 * The presigned PUT is signed with the exact `Content-Type` and `Content-Length`,
 * so the client cannot upload a different type or a larger body than was
 * authorized — those become signed headers the client must echo verbatim.
 */
export function createR2Storage(config: R2StorageConfig): ObjectStorage {
    const allowlist =
        config.allowedContentTypes ?? DEFAULT_ALLOWED_CONTENT_TYPES;
    const maxUploadBytes = config.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
    const uploadExpiry =
        config.uploadExpirySeconds ?? DEFAULT_UPLOAD_EXPIRY_SECONDS;
    const downloadExpiry =
        config.downloadExpirySeconds ?? DEFAULT_DOWNLOAD_EXPIRY_SECONDS;
    const publicBaseUrl =
        config.publicBaseUrl === undefined
            ? undefined
            : stripTrailingSlashes(config.publicBaseUrl);

    const uploadSchema = buildUploadInputSchema({ allowlist, maxUploadBytes });

    const client =
        config.s3Client ??
        new S3Client({
            endpoint: config.endpoint,
            region: config.region ?? "auto",
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
            // R2 requires path-style addressing.
            forcePathStyle: true,
        });

    const presign = config.presign ?? defaultPresigner;

    return {
        async createSignedUploadUrl(
            input: CreateSignedUploadUrlInput,
        ): Promise<SignedUploadUrl> {
            // Validate at the boundary: allowlist + size cap enforced here.
            const parsed = uploadSchema.parse(input);

            const key = buildObjectKey({
                organizationId: parsed.organizationId,
                filename: parsed.filename,
                purpose: parsed.purpose,
                uuid: randomUUID(),
            });

            const command = new PutObjectCommand({
                Bucket: config.bucket,
                Key: key,
                // Signed into the URL — the client must send these exact values.
                ContentType: parsed.contentType,
                ContentLength: parsed.contentLength,
            });

            const url = await presign(client, command, {
                expiresIn: uploadExpiry,
            });

            return {
                url,
                method: "PUT",
                key,
                headers: {
                    "Content-Type": parsed.contentType,
                    "Content-Length": String(parsed.contentLength),
                },
                expiresAt: new Date(
                    Date.now() + uploadExpiry * 1000,
                ).toISOString(),
                maxContentLength: parsed.contentLength,
            };
        },

        async createSignedDownloadUrl(
            key: string,
            opts?: SignedDownloadUrlOptions,
        ): Promise<SignedDownloadUrl> {
            const expiresIn = opts?.expiresInSeconds ?? downloadExpiry;
            const command = new GetObjectCommand({
                Bucket: config.bucket,
                Key: key,
                ResponseContentDisposition: opts?.downloadFilename
                    ? `attachment; filename="${opts.downloadFilename}"`
                    : undefined,
            });

            const url = await presign(client, command, { expiresIn });

            return {
                url,
                method: "GET",
                key,
                expiresAt: new Date(
                    Date.now() + expiresIn * 1000,
                ).toISOString(),
            };
        },

        getPublicUrl(key: string): string {
            if (publicBaseUrl === undefined || publicBaseUrl.length === 0) {
                throw new Error(
                    "getPublicUrl requires `publicBaseUrl` in R2StorageConfig",
                );
            }
            return `${publicBaseUrl}/${key}`;
        },

        async deleteObject(key: string): Promise<void> {
            await client.send(
                new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
            );
        },

        async headObject(key: string): Promise<HeadObjectResult | null> {
            try {
                const out = await client.send(
                    new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
                );
                return {
                    key,
                    contentType: out.ContentType,
                    contentLength: out.ContentLength,
                    etag: out.ETag,
                };
            } catch (error) {
                if (isNotFound(error)) return null;
                throw error;
            }
        },
    };
}
