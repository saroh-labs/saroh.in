/**
 * `@saroh/object-storage` — provider-agnostic object-storage boundary.
 *
 * Depend on the {@link ObjectStorage} port everywhere. Construct a concrete
 * adapter (R2 for prod, memory for tests/dev) at the app's composition root and
 * pass config in — this package never reads `process.env`.
 */

// Port + shared types
export type {
    ContentTypeAllowlist,
    CreateSignedUploadUrlInput,
    HeadObjectResult,
    ObjectStorage,
    SignedDownloadUrl,
    SignedDownloadUrlOptions,
    SignedUploadUrl,
} from "./port";

// Validation surface (allowlist defaults, size cap, schema builder)
export {
    DEFAULT_ALLOWED_CONTENT_TYPES,
    DEFAULT_MAX_UPLOAD_BYTES,
    buildUploadInputSchema,
    extensionForContentType,
    isAllowedContentType,
} from "./validation";
export type {
    UploadInputSchemaOptions,
    ValidatedUploadInput,
} from "./validation";

// Key derivation helpers (pure)
export { buildObjectKey, sanitizeFilename, sanitizeSegment } from "./keys";
export type { BuildObjectKeyInput } from "./keys";

// Cloudflare R2 adapter (first provider)
export { createR2Storage } from "./r2-adapter";
export type { R2StorageConfig } from "./r2-adapter";

// In-memory adapter (tests / local dev)
export { createMemoryStorage } from "./memory-adapter";
export type {
    MemoryStorage,
    MemoryStorageConfig,
    MemoryStoredObject,
} from "./memory-adapter";
