/**
 * `ObjectStorage` — the provider-agnostic object-storage PORT.
 *
 * Everything the product uses for media lives behind this interface. The first
 * adapter is Cloudflare R2 (see `r2-adapter.ts`), but because callers only ever
 * depend on this port an authorized upload "can later move to DigitalOcean
 * Spaces without product changes" (ticket S2-008). A second, network-free
 * in-memory adapter (`memory-adapter.ts`) is used for tests and local/dev.
 *
 * Design rules the port enforces on every adapter:
 *  - The client NEVER controls the raw storage key. The key is derived
 *    server-side and is tenant-scoped (`org/<organizationId>/...`) so one
 *    organization can never read or overwrite another's objects.
 *  - Uploads happen directly from the client to storage via a presigned PUT
 *    URL; the caller-supplied content-type is checked against an allowlist and
 *    the content-length is capped before a URL is ever minted.
 */

/** Content-type allowlist: MIME type -> canonical file extension. */
export type ContentTypeAllowlist = Record<string, string>;

/** Input for minting a presigned upload (PUT) URL. */
export interface CreateSignedUploadUrlInput {
    /** Tenant the object belongs to — drives key namespacing / isolation. */
    organizationId: string;
    /** MIME type the client will upload; validated against the allowlist. */
    contentType: string;
    /** Exact byte length the client will upload; capped at the max size. */
    contentLength: number;
    /** Caller-supplied original filename; sanitized before use in the key. */
    filename: string;
    /**
     * Optional logical bucketing within the tenant, e.g. `product-image`,
     * `avatar`, `post-cover`. Sanitized to `[a-z0-9-]`.
     */
    purpose?: string;
}

/** A minted presigned upload URL plus everything the client needs to PUT. */
export interface SignedUploadUrl {
    /** Presigned URL the client PUTs the bytes to. */
    url: string;
    method: "PUT";
    /** Server-derived, tenant-scoped storage key the object will live at. */
    key: string;
    /**
     * Headers the client MUST send with the PUT for the signature to match
     * (at minimum `Content-Type`, and `Content-Length` when the adapter signs
     * an exact length).
     */
    headers: Record<string, string>;
    /** ISO-8601 instant after which the signed URL is no longer valid. */
    expiresAt: string;
    /** The byte cap the URL was signed for (echoes `contentLength`). */
    maxContentLength: number;
}

/** Options for minting a presigned download (GET) URL for a private object. */
export interface SignedDownloadUrlOptions {
    /** Lifetime of the URL in seconds; defaults to the adapter config. */
    expiresInSeconds?: number;
    /** When set, forces a download with this filename (Content-Disposition). */
    downloadFilename?: string;
}

/** A minted presigned download URL. */
export interface SignedDownloadUrl {
    url: string;
    method: "GET";
    key: string;
    /** ISO-8601 instant after which the signed URL is no longer valid. */
    expiresAt: string;
}

/** Metadata confirming an object landed in storage. */
export interface HeadObjectResult {
    key: string;
    contentType?: string;
    contentLength?: number;
    etag?: string;
}

/**
 * The storage boundary every adapter implements. Adapters are constructed by a
 * factory that receives typed config from the app (no `process.env` reads
 * inside this package).
 */
export interface ObjectStorage {
    /**
     * Mint a presigned PUT URL for a direct client upload. Validates
     * `contentType` against the allowlist and caps `contentLength`, then
     * derives a tenant-scoped key. Throws on invalid input; never trusts a
     * client-supplied key.
     */
    createSignedUploadUrl(
        input: CreateSignedUploadUrlInput,
    ): Promise<SignedUploadUrl>;

    /** Mint a presigned GET URL for a private object. */
    createSignedDownloadUrl(
        key: string,
        opts?: SignedDownloadUrlOptions,
    ): Promise<SignedDownloadUrl>;

    /**
     * The stable public URL for an object when the bucket/object is public
     * (served from the CDN base). Throws if no public base URL is configured.
     */
    getPublicUrl(key: string): string;

    /** Delete an object. Idempotent — deleting a missing key is not an error. */
    deleteObject(key: string): Promise<void>;

    /** Confirm an upload landed; resolves `null` when the key does not exist. */
    headObject(key: string): Promise<HeadObjectResult | null>;
}
