import type { Provider } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import type { ObjectStorage } from "@saroh/object-storage";
import { createMemoryStorage, createR2Storage } from "@saroh/object-storage";

import { env } from "../../env";

/**
 * DI token for the {@link ObjectStorage} port. Inject with
 * `@Inject(OBJECT_STORAGE)` — handlers/services depend only on the port, never
 * on a concrete adapter, so the storage provider can move from R2 to another
 * S3-compatible backend without touching business code (S2-008a design goal).
 */
export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");

/**
 * Build the concrete {@link ObjectStorage} from the app's typed env at the
 * composition root (the object-storage package never reads `process.env`).
 *
 * When the full R2 credential set is present we construct the Cloudflare R2
 * adapter. Otherwise — local/dev/offline or CI without secrets — we fall back to
 * the network-free in-memory adapter and log a loud warning so nobody mistakes
 * memory storage (bytes are NOT persisted) for the real thing.
 */
export function createObjectStorage(logger: Logger): ObjectStorage {
    if (
        env.R2_ENDPOINT &&
        env.R2_BUCKET &&
        env.R2_ACCESS_KEY_ID &&
        env.R2_SECRET_ACCESS_KEY
    ) {
        logger.log(`Object storage: Cloudflare R2 (bucket "${env.R2_BUCKET}")`);
        return createR2Storage({
            endpoint: env.R2_ENDPOINT,
            bucket: env.R2_BUCKET,
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            publicBaseUrl: env.R2_PUBLIC_BASE_URL,
        });
    }

    logger.warn(
        "Object storage: using the IN-MEMORY adapter (no R2 credentials). " +
            "Uploads are trusted and bytes are NOT persisted — dev/test only. " +
            "Set R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY for real storage.",
    );
    return createMemoryStorage({ publicBaseUrl: env.R2_PUBLIC_BASE_URL });
}

/**
 * Nest provider exposing the {@link ObjectStorage} port under
 * {@link OBJECT_STORAGE}. Constructed once (singleton) from env.
 */
export const objectStorageProvider: Provider = {
    provide: OBJECT_STORAGE,
    useFactory: (): ObjectStorage =>
        createObjectStorage(new Logger("ObjectStorage")),
};
