import { randomUUID } from "node:crypto";

import { buildObjectKey } from "./keys";
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

/** Config for the in-memory adapter — everything optional. */
export interface MemoryStorageConfig {
    /** Fake public/base URL used to shape returned URLs. Defaults to a stub. */
    publicBaseUrl?: string;
    allowedContentTypes?: ContentTypeAllowlist;
    maxUploadBytes?: number;
    uploadExpirySeconds?: number;
    downloadExpirySeconds?: number;
    /** Injectable id generator for deterministic tests. Defaults to `randomUUID`. */
    generateId?: () => string;
}

/** A record of an object the memory adapter "stored" (i.e. minted a PUT for). */
export interface MemoryStoredObject {
    key: string;
    contentType: string;
    contentLength: number;
}

/**
 * An {@link ObjectStorage} plus test-only introspection helpers.
 */
export interface MemoryStorage extends ObjectStorage {
    /** Keys the adapter has minted an upload URL for. */
    listKeys(): string[];
    /** Look up a tracked object by key. */
    get(key: string): MemoryStoredObject | undefined;
    /** Has this key been "uploaded"? */
    has(key: string): boolean;
    /** Clear all tracked state. */
    reset(): void;
}

const DEFAULT_UPLOAD_EXPIRY_SECONDS = 600;
const DEFAULT_DOWNLOAD_EXPIRY_SECONDS = 900;
const DEFAULT_BASE_URL = "https://memory.object-storage.test";

/**
 * A network-free {@link ObjectStorage} for tests and local/dev. It honors the
 * same validation and tenant-scoped key rules as the real adapters, returns
 * well-formed (fake) URLs/keys, and tracks stored keys in memory.
 */
export function createMemoryStorage(
    config: MemoryStorageConfig = {},
): MemoryStorage {
    const allowlist =
        config.allowedContentTypes ?? DEFAULT_ALLOWED_CONTENT_TYPES;
    const maxUploadBytes = config.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
    const uploadExpiry =
        config.uploadExpirySeconds ?? DEFAULT_UPLOAD_EXPIRY_SECONDS;
    const downloadExpiry =
        config.downloadExpirySeconds ?? DEFAULT_DOWNLOAD_EXPIRY_SECONDS;
    const baseUrl = (config.publicBaseUrl ?? DEFAULT_BASE_URL).replace(
        /\/+$/,
        "",
    );
    const generateId = config.generateId ?? randomUUID;

    const uploadSchema = buildUploadInputSchema({ allowlist, maxUploadBytes });
    const store = new Map<string, MemoryStoredObject>();

    return {
        // eslint-disable-next-line @typescript-eslint/require-await -- async so bad input rejects (parse throws) instead of throwing synchronously, matching the port contract.
        async createSignedUploadUrl(
            input: CreateSignedUploadUrlInput,
        ): Promise<SignedUploadUrl> {
            const parsed = uploadSchema.parse(input);
            const key = buildObjectKey({
                organizationId: parsed.organizationId,
                filename: parsed.filename,
                purpose: parsed.purpose,
                uuid: generateId(),
            });

            store.set(key, {
                key,
                contentType: parsed.contentType,
                contentLength: parsed.contentLength,
            });

            return {
                url: `${baseUrl}/upload/${encodeURI(key)}?sig=fake&expires=${uploadExpiry}`,
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

        createSignedDownloadUrl(
            key: string,
            opts?: SignedDownloadUrlOptions,
        ): Promise<SignedDownloadUrl> {
            const expiresIn = opts?.expiresInSeconds ?? downloadExpiry;
            return Promise.resolve({
                url: `${baseUrl}/download/${encodeURI(key)}?sig=fake&expires=${expiresIn}`,
                method: "GET",
                key,
                expiresAt: new Date(
                    Date.now() + expiresIn * 1000,
                ).toISOString(),
            });
        },

        getPublicUrl(key: string): string {
            return `${baseUrl}/${key}`;
        },

        deleteObject(key: string): Promise<void> {
            store.delete(key);
            return Promise.resolve();
        },

        headObject(key: string): Promise<HeadObjectResult | null> {
            const stored = store.get(key);
            if (stored === undefined) return Promise.resolve(null);
            return Promise.resolve({
                key,
                contentType: stored.contentType,
                contentLength: stored.contentLength,
                etag: `"fake-etag-${stored.contentLength}"`,
            });
        },

        listKeys(): string[] {
            return [...store.keys()];
        },

        get(key: string): MemoryStoredObject | undefined {
            return store.get(key);
        },

        has(key: string): boolean {
            return store.has(key);
        },

        reset(): void {
            store.clear();
        },
    };
}
