/**
 * Give photos uploaded before DEC-246 what new uploads get in the browser:
 * their size, a ThumbHash blur and smaller WebP copies (plan
 * image-variants §4). The original keeps its key and its bytes, because
 * published pages point at it; the copies go beside it at
 * `variantKey(key, width)` (`x.jpg` → `x.jpg@480.webp`, `x.webp` →
 * `x@480.webp`), only at widths narrower than the photo.
 *
 * - GIFs keep their animation and logos (`business-logo`) stay PNG/JPG for
 *   the invoice PDF: both get size and blur, and `variants: []`.
 * - Videos and SVGs are not selected.
 * - `sizeBytes` stays the original's size; the copies' bytes go in
 *   `variantBytes`, which storage metering adds, as for a new upload.
 *
 * A row is picked while its `variants` is null, so a run that stops partway
 * is resumed by running it again.
 */
import {
    IMAGE_WEBP_QUALITY,
    isValidPlaceholder,
    variantKey,
    variantWidthsFor,
} from "@saroh/block-contract";
import type { PrismaClient } from "@saroh/database";
import { Prisma } from "@saroh/database";
import type { ObjectStorage } from "@saroh/object-storage";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";

/** The raster types an upload may be; SVG and video are left alone. */
export const RASTER_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/gif",
] as const;

const BATCH = 50;

export interface ImageFacts {
    width: number;
    height: number;
    placeholder: string;
    copies: { width: number; body: Buffer }[];
}

/**
 * Size, blur and copies of one image, upright (EXIF orientation applied).
 * Copies carry no metadata: sharp drops EXIF (and its GPS) unless asked.
 */
export async function imageFacts(
    input: Buffer,
    opts: { copies: boolean },
): Promise<ImageFacts> {
    const { width, height } = (await sharp(input).metadata()).autoOrient;

    const small = await sharp(input)
        .rotate()
        .resize(100, 100, { fit: "inside" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const placeholder = Buffer.from(
        rgbaToThumbHash(small.info.width, small.info.height, small.data),
    ).toString("base64");
    if (!isValidPlaceholder(placeholder)) throw new Error("bad placeholder");

    const copies: ImageFacts["copies"] = [];
    if (opts.copies) {
        for (const w of variantWidthsFor(width)) {
            const body = await sharp(input)
                .rotate()
                .resize({ width: w })
                .webp({ quality: Math.round(IMAGE_WEBP_QUALITY * 100) })
                .toBuffer();
            copies.push({ width: w, body });
        }
    }
    return { width, height, placeholder, copies };
}

export interface BackfillReport {
    candidates: number;
    done: number;
    copies: number;
    copyBytes: number;
    failed: string[];
}

export interface BackfillOptions {
    dryRun: boolean;
    limit?: number;
    log?: (line: string) => void;
}

const pending = {
    status: "READY",
    contentType: { in: [...RASTER_TYPES] },
    variants: { equals: Prisma.DbNull },
} satisfies Prisma.MediaWhereInput;

async function readAll(
    storage: ObjectStorage,
    key: string,
): Promise<Buffer | null> {
    const stream = await storage.readObject(key);
    if (!stream) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

export async function backfillMediaVariants(
    db: PrismaClient,
    storage: ObjectStorage,
    opts: BackfillOptions,
): Promise<BackfillReport> {
    const log = opts.log ?? (() => undefined);
    const candidates = await db.media.count({ where: pending });
    const report: BackfillReport = {
        candidates,
        done: 0,
        copies: 0,
        copyBytes: 0,
        failed: [],
    };
    if (opts.dryRun) return report;

    const limit = opts.limit ?? Infinity;
    let cursor: string | undefined;
    let seen = 0;
    while (seen < limit) {
        const rows = await db.media.findMany({
            where: { ...pending, ...(cursor ? { id: { gt: cursor } } : {}) },
            orderBy: { id: "asc" },
            take: Math.min(BATCH, limit - seen),
            select: { id: true, key: true, contentType: true, purpose: true },
        });
        if (rows.length === 0) break;
        for (const row of rows) {
            cursor = row.id;
            seen++;
            try {
                const input = await readAll(storage, row.key);
                if (!input) throw new Error("no bytes in storage");
                const keepAsIs =
                    row.contentType === "image/gif" ||
                    row.purpose === "business-logo";
                const facts = await imageFacts(input, { copies: !keepAsIs });
                const variants = [];
                for (const copy of facts.copies) {
                    const key = variantKey(row.key, copy.width);
                    if (!key) throw new Error("no copy key");
                    await storage.putObject(key, copy.body, {
                        contentType: "image/webp",
                        contentLength: copy.body.byteLength,
                    });
                    variants.push({
                        width: copy.width,
                        key,
                        bytes: copy.body.byteLength,
                    });
                    report.copies++;
                    report.copyBytes += copy.body.byteLength;
                }
                // Still null: never overwrite what an upload wrote meanwhile.
                await db.media.updateMany({
                    where: { id: row.id, variants: { equals: Prisma.DbNull } },
                    data: {
                        width: facts.width,
                        height: facts.height,
                        placeholder: facts.placeholder,
                        variants,
                        variantBytes: variants.reduce((n, v) => n + v.bytes, 0),
                    },
                });
                report.done++;
            } catch (error) {
                report.failed.push(row.id);
                log(
                    `failed ${row.id}: ${error instanceof Error ? error.message : "error"}`,
                );
            }
        }
        log(
            `${seen} read, ${report.done} done, ${report.failed.length} failed`,
        );
    }
    return report;
}
