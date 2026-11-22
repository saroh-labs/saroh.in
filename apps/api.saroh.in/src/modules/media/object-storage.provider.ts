import type { Provider } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import type { MediaBucket } from "@saroh/database";
import type { Edition } from "@saroh/edition";
import { editionProfile } from "@saroh/edition";
import type { ObjectStorage } from "@saroh/object-storage";
import { createMemoryStorage, createR2Storage } from "@saroh/object-storage";

import { editionOf } from "../../common/app-url";
import { env } from "../../env";

/**
 * DI token for {@link MediaStorages}: every media bucket, chosen by the
 * business's edition for a new file and by the bucket a stored file was
 * written to for everything after. Handlers depend on the port only, never
 * on a concrete adapter (S2-008a design goal).
 */
export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");

/** A bucket and the storage that reaches it. */
export interface BucketStorage {
    bucket: MediaBucket;
    storage: ObjectStorage;
}

/**
 * The media buckets (owner, 22 Nov 2026): India's and development's main
 * bucket, and Global businesses' own once `R2_GLOBAL_BUCKET` is set. A
 * Global business's new files only ever go to the Global bucket; a file
 * already stored is read and deleted where it was written.
 */
export interface MediaStorages {
    /** Where a business with this edition stores a new file. */
    forEdition(edition: Edition): BucketStorage;
    /** The same, by the business's edition read from its row. */
    forOrganization(organizationId: string): Promise<BucketStorage>;
    /** Where a stored file is: the bucket it was written to. */
    of(bucket: MediaBucket): ObjectStorage;
    /** The bucket that serves `key` at exactly `url`, or null. */
    servingUrl(key: string, url: string): ObjectStorage | null;
    /** Every configured bucket, main first. */
    readonly all: readonly BucketStorage[];
}

/** The buckets from their storages; `global` null means Global uses main. */
export function mediaStorages(
    main: ObjectStorage,
    global: ObjectStorage | null,
): MediaStorages {
    const all: BucketStorage[] = [{ bucket: "MAIN", storage: main }];
    if (global) all.push({ bucket: "GLOBAL", storage: global });
    const forEdition = (edition: Edition): BucketStorage =>
        editionProfile(edition).ownMediaBucket && global
            ? { bucket: "GLOBAL", storage: global }
            : { bucket: "MAIN", storage: main };
    const byBucket: Record<MediaBucket, ObjectStorage | null> = {
        MAIN: main,
        GLOBAL: global,
    };
    return {
        all,
        forEdition,
        // One bucket: nothing to choose, so no read.
        forOrganization: async (organizationId) =>
            global
                ? forEdition(await editionOf(organizationId))
                : forEdition("INDIA"),
        of(bucket) {
            // A row always names one; main for anything else.
            const storage = bucket in byBucket ? byBucket[bucket] : main;
            // Never main in its place: that is another bucket's key space.
            if (!storage) {
                throw new Error(
                    "A file is in the Global media bucket, but R2_GLOBAL_BUCKET is not set",
                );
            }
            return storage;
        },
        servingUrl(key, url) {
            for (const { storage } of all) {
                try {
                    if (storage.getPublicUrl(key) === url) return storage;
                } catch {
                    // No public base: it serves nothing.
                }
            }
            return null;
        },
    };
}

/**
 * Build the main bucket's {@link ObjectStorage} from the app's typed env at
 * the composition root (the object-storage package never reads
 * `process.env`).
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
 * Global businesses' bucket, or null when `R2_GLOBAL_BUCKET` is unset (then
 * Global uses the main bucket, as before). `env.ts` refuses a partial set;
 * this checks again for a run under `SKIP_ENV_VALIDATION`.
 */
export function createGlobalObjectStorage(
    logger: Logger,
): ObjectStorage | null {
    if (!env.R2_GLOBAL_BUCKET) return null;
    if (
        !env.R2_ENDPOINT ||
        !env.R2_GLOBAL_ACCESS_KEY_ID ||
        !env.R2_GLOBAL_SECRET_ACCESS_KEY ||
        !env.R2_GLOBAL_PUBLIC_BASE_URL
    ) {
        throw new Error(
            "R2_GLOBAL_BUCKET is set without R2_GLOBAL_PUBLIC_BASE_URL, R2_GLOBAL_ACCESS_KEY_ID, R2_GLOBAL_SECRET_ACCESS_KEY and R2_ENDPOINT: set all or none",
        );
    }
    logger.log(
        `Object storage: Global businesses' R2 bucket "${env.R2_GLOBAL_BUCKET}"`,
    );
    return createR2Storage({
        endpoint: env.R2_ENDPOINT,
        bucket: env.R2_GLOBAL_BUCKET,
        accessKeyId: env.R2_GLOBAL_ACCESS_KEY_ID,
        secretAccessKey: env.R2_GLOBAL_SECRET_ACCESS_KEY,
        publicBaseUrl: env.R2_GLOBAL_PUBLIC_BASE_URL,
    });
}

/** Every media bucket, from env. */
export function createMediaStorages(logger: Logger): MediaStorages {
    return mediaStorages(
        createObjectStorage(logger),
        createGlobalObjectStorage(logger),
    );
}

/**
 * Nest provider exposing {@link MediaStorages} under {@link OBJECT_STORAGE}.
 * Constructed once (singleton) from env.
 */
export const objectStorageProvider: Provider = {
    provide: OBJECT_STORAGE,
    useFactory: (): MediaStorages =>
        createMediaStorages(new Logger("ObjectStorage")),
};
