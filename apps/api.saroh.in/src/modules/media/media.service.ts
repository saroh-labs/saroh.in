import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import {
    ASK_AI_IMAGE_MAX_BYTES,
    ASK_AI_IMAGE_PURPOSE,
    ASK_AI_IMAGE_TYPES,
    ASK_AI_SENT_PURPOSE,
} from "@saroh/api-contract";
import { variantKey } from "@saroh/block-contract";
import type { MediaBucket, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { ObjectStorage } from "@saroh/object-storage";
import {
    IMAGE_END_BYTES,
    IMAGE_SNIFF_BYTES,
    ISO_BMFF_SNIFF_BYTES,
    isVideoContentType,
} from "@saroh/object-storage";

import { prismaErrorCode } from "../../common/prisma-errors";
import type { OrganizationContext } from "../../common/types/organization-context";
import { BYTES_PER_GB } from "../billing/metering";
import { planMeter } from "../billing/metering.service";
import {
    errorResult,
    logDeletionProviderCall,
} from "../organizations/deletion-provider-log";
import { authorize } from "../organizations/organization-policy";
import type { WindowLimiter } from "../rate-limits/shared-window";
import { SharedRateLimiter } from "../rate-limits/shared-window";
import type { MediaStorages } from "./object-storage.provider";
import { OBJECT_STORAGE } from "./object-storage.provider";
import type { CreateUploadInput } from "./upload-checks";
import {
    ASK_AI_NOT_IMAGE_MESSAGE,
    ASK_AI_TOO_BIG_MESSAGE,
    assertUploadType,
    BAD_SIZES_MESSAGE,
    NOTHING_UPLOADED_MESSAGE,
    storedBytesProblem,
    storedEndProblem,
    uploadSizesProblem,
} from "./upload-checks";
import type { StoredVariant } from "./variants";
import { mediaFileKeys, storedVariants, variantWidths } from "./variants";

/** A transparent 1 x 1 PNG: what development's in-memory storage stands in with. */
const STAND_IN_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
);

/** How long a chat image's signed link lives: a screen's worth, then it is asked for again. */
const ASK_AI_UPLOADS_PER_HOUR = 60;
/** Pictures picked for Ask AI and not yet sent, per person; they are swept after a day. */
const ASK_AI_UNSENT_PER_PERSON = 30;

const ASK_AI_VIEW_LINK_SECONDS = 15 * 60;

/** A deleted business's stored files, on its deletion trail (#921). */
const deletionLog = new Logger("OrganizationDeletion");

/** What the client needs to PUT the file directly to storage. */
export interface CreateUploadResult {
    mediaId: string;
    uploadUrl: string;
    method: "PUT";
    headers: Record<string, string>;
    key: string;
    expiresAt: string;
    /** One signed PUT per smaller copy, in the order asked (DEC-246). */
    variants: {
        width: number;
        uploadUrl: string;
        method: "PUT";
        headers: Record<string, string>;
        key: string;
    }[];
}

/**
 * Media metadata + signed-upload orchestration (S2-008).
 *
 * Every operation is tenant-scoped by `ctx.organizationId` — the org is taken
 * from the resolved {@link OrganizationContext} (proven by `OrganizationGuard`),
 * NEVER from a client-supplied value, so one organization can never read, flip,
 * or delete another's media. The raw bytes live in object storage behind the
 * {@link ObjectStorage} port; this service owns only the metadata index and the
 * PENDING → READY lifecycle.
 */
/**
 * The sweep removed the upload first (never confirmed in time, N12): its
 * row is gone, so a confirm answers "nothing uploaded", as for a failed
 * one, not a 500. Anything else is rethrown unless `onlyGone`.
 */
function goneAsNothing(error: unknown, onlyGone = false): void {
    if (prismaErrorCode(error) === "P2025") {
        throw new BadRequestException(NOTHING_UPLOADED_MESSAGE);
    }
    if (!onlyGone) throw error;
}

@Injectable()
export class MediaService {
    /** One person's Ask AI upload links an hour (M1): the library's gate is not on them. */
    askAiUploadLimiter: WindowLimiter = new SharedRateLimiter(
        "ask-ai-image-uploads",
        ASK_AI_UPLOADS_PER_HOUR,
        60 * 60 * 1000,
    );

    constructor(
        @Inject(OBJECT_STORAGE) private readonly storages: MediaStorages,
    ) {}

    /**
     * Issue a presigned upload URL and record a PENDING row.
     *
     * Flow: authorize `media:write` → ask the port to mint a signed PUT for
     * `ctx.organizationId` (the port validates content-type/size and derives the
     * tenant-scoped key) → persist a PENDING `Media` row keyed by that key. The
     * client then PUTs the bytes straight to storage and calls
     * {@link completeUpload} to flip the row to READY.
     */
    async createUpload(
        ctx: OrganizationContext,
        input: CreateUploadInput,
    ): Promise<CreateUploadResult> {
        // An Ask AI image is the asker's own, for the conversation: Ask AI's
        // action, not the library's.
        authorize(
            ctx,
            input.purpose === ASK_AI_IMAGE_PURPOSE ? "ai:use" : "media:write",
        );
        assertUploadType(input);
        const sizesProblem = uploadSizesProblem(input);
        if (sizesProblem) throw new BadRequestException(sizesProblem);
        if (input.purpose === ASK_AI_IMAGE_PURPOSE) {
            await this.admitAskAiUpload(ctx);
        }

        // The business's edition's bucket; the row remembers which (owner,
        // 22 Nov 2026).
        const { bucket, storage } = await this.storages.forOrganization(
            ctx.organizationId,
        );
        const signed = await storage.createSignedUploadUrl({
            organizationId: ctx.organizationId,
            contentType: input.contentType,
            contentLength: input.contentLength,
            filename: input.filename,
            purpose: input.purpose,
        });
        // The smaller copies sit beside the photo, at keys the server
        // makes from its key; the client never names one (DEC-246).
        const copies = await Promise.all(
            (input.variants ?? []).map(async (v) => {
                const key = variantKey(signed.key, v.width) ?? "";
                const put = await storage.createSignedUploadUrl({
                    organizationId: ctx.organizationId,
                    // The same type as the photo (WebP, or JPEG).
                    contentType: input.contentType,
                    contentLength: v.contentLength,
                    filename: input.filename,
                    purpose: input.purpose,
                    key,
                });
                return { width: v.width, key, bytes: v.contentLength, put };
            }),
        );
        const variants: StoredVariant[] = copies.map(
            ({ width, key, bytes }) => ({ width, key, bytes }),
        );
        // Every file counts against the plan's storage, not only the photo.
        const allBytes = variants.reduce(
            (n, v) => n + v.bytes,
            input.contentLength,
        );

        // The plan's storage, checked before a byte is sent (owner, 20 Nov
        // 2026): a hard cell refuses an upload that would pass it, at the
        // size it says; a soft one counts and tells. The PENDING row holds
        // that space from now, so uploads started side by side are counted
        // against each other (M-5); one never confirmed is swept
        // (`pending-upload-sweep.job.ts`). The URL is only signed above,
        // never handed out when this refuses.
        const media = await planMeter.withRoom(
            ctx.organizationId,
            "storage",
            (db) =>
                db.media.create({
                    data: {
                        organizationId: ctx.organizationId,
                        key: signed.key,
                        bucket,
                        contentType: input.contentType,
                        sizeBytes: input.contentLength,
                        filename: input.filename,
                        purpose: input.purpose ?? null,
                        status: "PENDING",
                        uploadedByUserId: ctx.userId,
                        width: input.width ?? null,
                        height: input.height ?? null,
                        placeholder: input.placeholder ?? null,
                        ...(variants.length > 0
                            ? {
                                  variants:
                                      variants as unknown as Prisma.InputJsonValue,
                                  variantBytes: allBytes - input.contentLength,
                              }
                            : {}),
                    },
                }),
            { adding: allBytes / BYTES_PER_GB },
        );

        return {
            mediaId: media.id,
            uploadUrl: signed.url,
            method: signed.method,
            headers: signed.headers,
            key: signed.key,
            expiresAt: signed.expiresAt,
            variants: copies.map((c) => ({
                width: c.width,
                uploadUrl: c.put.url,
                method: c.put.method,
                headers: c.put.headers,
                key: c.key,
            })),
        };
    }

    /** `ai:use` mints no more than a person's share: an hourly rate and a cap of unsent pictures (M1). */
    private async admitAskAiUpload(ctx: OrganizationContext): Promise<void> {
        const key = `${ctx.organizationId}:${ctx.userId}`;
        if (!(await this.askAiUploadLimiter.take(key))) {
            throw new HttpException(
                "Too many pictures just now. Try again in a little while.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        const unsent = await prisma.media.count({
            where: {
                organizationId: ctx.organizationId,
                uploadedByUserId: ctx.userId,
                purpose: ASK_AI_IMAGE_PURPOSE,
            },
        });
        if (unsent >= ASK_AI_UNSENT_PER_PERSON) {
            throw new HttpException(
                "Send a question with your pictures, or wait a day, before adding more.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
    }

    /**
     * Confirm an upload landed and flip the row PENDING → READY.
     *
     * The stored bytes must be the file the upload said; `headObject` then
     * reconciles the true size. The in-memory adapter of local development
     * never sees the browser's PUT, so there a photo goes through unread and
     * keeps the size it was recorded with; R2 reads the real object.
     */
    async completeUpload(
        ctx: OrganizationContext,
        mediaId: string,
    ): Promise<{
        id: string;
        status: string;
        sizeBytes: number;
        /** Where the object is served from, or null when nothing can serve it. */
        url: string | null;
    }> {
        const media = await this.requireOwned(ctx, mediaId);
        authorize(
            ctx,
            media.purpose === ASK_AI_IMAGE_PURPOSE ? "ai:use" : "media:write",
        );
        if (media.status === "FAILED") {
            throw new BadRequestException(NOTHING_UPLOADED_MESSAGE);
        }

        /*
         * A file is checked for what it is, not what it was labelled (#517,
         * #873): its first bytes, one ranged GET, must be the format its
         * type says (`upload-checks.ts`). Anything else is marked FAILED and
         * its object deleted, so nothing can put it on a product, a page or
         * the logo.
         */
        const files = await this.checkStoredFiles(media);
        if (files.problem) {
            await prisma.media
                .update({
                    where: { id: media.id },
                    data: { status: "FAILED" },
                })
                .catch(goneAsNothing);
            await this.deleteFiles(media);
            throw new BadRequestException(files.problem);
        }

        const head = files.head;
        // Reconcile the authoritative size from storage when available; the
        // memory adapter reports the size we recorded, R2 the real object size.
        // Falls back to the recorded size when the head misses (dev/memory).
        const sizeBytes = head?.contentLength ?? media.sizeBytes;

        // The plan's storage again, with the real size: the PENDING row
        // already holds the size the upload said, so only bytes past it are
        // added (none on a second confirm). Hard or soft as the catalogue's
        // cell says. A refusal fails the upload and deletes its object, so
        // it holds no space it was refused.
        const extra =
            media.status === "READY"
                ? 0
                : Math.max(0, sizeBytes - media.sizeBytes) / BYTES_PER_GB;
        const updated = await planMeter
            .withRoom(
                ctx.organizationId,
                "storage",
                (db) =>
                    db.media.update({
                        where: { id: media.id },
                        data: { status: "READY", sizeBytes },
                    }),
                { adding: extra },
            )
            .catch(async (error: unknown) => {
                goneAsNothing(error, true);
                if (error instanceof ForbiddenException) {
                    await prisma.media.update({
                        where: { id: media.id },
                        data: { status: "FAILED" },
                    });
                    await this.deleteFiles(media);
                }
                throw error;
            });

        return {
            id: updated.id,
            status: updated.status,
            sizeBytes: updated.sizeBytes,
            /*
             * The whole reason a merchant uploaded was to put the picture on
             * something (#205). Until now this returned id, status and size and
             * left them holding a key with no way to turn it into an <img src>
             * — an upload that completed and could not be used.
             */
            url: await this.viewUrlFor(updated),
        };
    }

    /** List the org's media, newest first. Tenant-scoped by ctx. */
    async list(ctx: OrganizationContext) {
        authorize(ctx, "media:read");
        const rows = await prisma.media.findMany({
            // Ask AI's images stay with their conversation until one is applied.
            where: {
                organizationId: ctx.organizationId,
                OR: [
                    { purpose: null },
                    {
                        purpose: {
                            notIn: [ASK_AI_IMAGE_PURPOSE, ASK_AI_SENT_PURPOSE],
                        },
                    },
                ],
            },
            orderBy: { createdAt: "desc" },
        });
        // The copies' widths, not their keys: a copy's address is its
        // photo's, with the width beside it (`variantSrc`).
        return rows.map(({ variants, bucket, ...row }) => ({
            ...row,
            url: this.publicUrlFor({ key: row.key, bucket }),
            widths: variantWidths(variants),
        }));
    }

    /** A library object's public address, or null when storage can't serve it. */
    urlOf(media: { key: string; bucket: MediaBucket }): string | null {
        return this.publicUrlFor(media);
    }

    /**
     * The stable public URL for a key, or null when storage cannot serve it.
     *
     * `getPublicUrl` throws when no public base is configured. That is the
     * right behaviour for the port — a URL nobody can fetch is worse than an
     * error — but at this boundary it must not take a whole upload down with
     * it. Null is an honest answer the client can act on ("storage is not set
     * up to serve images"); an exception here would have surfaced as a 500 on
     * an upload that succeeded.
     */
    private publicUrlFor(media: {
        key: string;
        bucket: MediaBucket;
    }): string | null {
        try {
            return this.storages.of(media.bucket).getPublicUrl(media.key);
        } catch {
            return null;
        }
    }

    /**
     * Where a person's browser reads an object. A chat image (Ask AI's, before
     * it is applied) is private: a short-lived signed link from its own
     * edition's bucket, never the public media host (M2). Everything else is
     * served from the public address.
     */
    private async viewUrlFor(media: {
        key: string;
        bucket: MediaBucket;
        purpose: string | null;
    }): Promise<string | null> {
        if (
            media.purpose !== ASK_AI_IMAGE_PURPOSE &&
            media.purpose !== ASK_AI_SENT_PURPOSE
        ) {
            return this.publicUrlFor(media);
        }
        try {
            const signed = await this.storages
                .of(media.bucket)
                .createSignedDownloadUrl(media.key, {
                    expiresInSeconds: ASK_AI_VIEW_LINK_SECONDS,
                });
            return signed.url;
        } catch {
            return null;
        }
    }

    /**
     * Delete a media row and its stored object. Tenant-scoped; cross-tenant or
     * missing ids 404. `deleteObject` is idempotent so a partial state is safe.
     */
    async remove(
        ctx: OrganizationContext,
        mediaId: string,
    ): Promise<{ id: string; deleted: true }> {
        authorize(ctx, "media:write");

        const media = await this.requireOwned(ctx, mediaId);

        /*
         * An image a publication references cannot be deleted (#205).
         *
         * A Publication is immutable and is the site as it was served. Deleting
         * an object it points at does not edit the snapshot — it leaves a
         * broken image on a live site that nothing in the product can repair
         * short of republishing. The key is unique and appears verbatim inside
         * the public URL the snapshot stores, so a text search over the
         * snapshots is exact rather than heuristic.
         *
         * Raw because Prisma's JSON filters address a path, not the whole
         * document, and the image may sit in a hero, a gallery or the share
         * card — three paths today and more tomorrow.
         */
        const [{ count }] = await prisma.$queryRaw<[{ count: number }]>`
            SELECT COUNT(*)::int AS count
            FROM "Publication"
            WHERE snapshot::text LIKE ${"%" + media.key + "%"}
        `;
        if (count > 0) {
            throw new ConflictException(
                "This image is on a published site. Replace it there and publish again before deleting it.",
            );
        }

        // A product showing it keeps a live link to the object; deleting it
        // would leave a broken photo on that product. Take it off first.
        const onProducts = await prisma.productImage.count({
            where: { mediaId: media.id },
        });
        if (onProducts > 0) {
            throw new ConflictException(
                onProducts === 1
                    ? "This image is on a product. Take it off the product before deleting it."
                    : `This image is on ${onProducts} products. Take it off them before deleting it.`,
            );
        }

        // The business logo prints on its invoices; deleting it would leave
        // them with a broken image. Remove it as the logo first.
        const asLogo = await prisma.businessProfile.count({
            where: { logoMediaId: media.id },
        });
        if (asLogo > 0) {
            throw new ConflictException(
                "This image is your business logo. Remove it in Settings → Business before deleting it.",
            );
        }

        // The same for a location that uses it as its own logo (DEC-123).
        const asLocationLogo = await prisma.store.count({
            where: { logoMediaId: media.id, deletedAt: null },
        });
        if (asLocationLogo > 0) {
            throw new ConflictException(
                "This image is a location's logo. Replace it there, or use your business logo, before deleting it.",
            );
        }

        // A site's own icon (DEC-124): saved, perhaps not yet published, so
        // the published-site check above does not see it. Deleting it would
        // put a broken image in the tab at the next publish.
        const asIcon = await prisma.site.count({
            where: { iconMediaId: media.id },
        });
        if (asIcon > 0) {
            throw new ConflictException(
                "This image is your site icon. Remove it in Website settings before deleting it.",
            );
        }

        await this.deleteFiles(media);
        await prisma.media.delete({ where: { id: media.id } });

        return { id: media.id, deleted: true };
    }

    /**
     * A deleted business's media go (#921): every object out of storage,
     * then its row, as {@link remove} does one — object first, so a row
     * never outlives nothing, and `deleteObject` is idempotent. The checks
     * `remove` makes for a live business (on a published site, on a
     * product, the logo) don't apply: its site is offline and its products
     * and logo are no longer shown. A product photo or the logo pointing at
     * one loses it (`SetNull`); the invoices keep their records, printed
     * without the logo.
     *
     * Run by `organization.retention.erase` (DEC-122), 180 days after the
     * business was deleted, with no caller context, in batches; a storage
     * failure leaves that row for the retry (and out of this run's next
     * batch), the rest go on, and the call throws at the end. Until DEC-122
     * the deletion clean-up ran it on day one.
     *
     * **Never for a business on legal hold.** `mayErase` is asked before
     * every batch: the eraser passes its hold check, so a hold placed while
     * the files are going stops them within a batch (`stopped`). Only a
     * caller that has checked the hold itself may leave it out
     * (`legal-hold.deletes.spec.ts` pins who calls this).
     */
    async removeAllForDeletedBusiness(
        organizationId: string,
        mayErase: () => Promise<boolean> = () => Promise.resolve(true),
    ): Promise<{ removed: number; failed: number; stopped: boolean }> {
        // A row removed is gone from the next read; only failures are kept
        // out of it, so a batch that always fails can't loop.
        const failedIds: string[] = [];
        let removed = 0;
        let stopped = false;
        for (;;) {
            if (!(await mayErase())) {
                stopped = true;
                break;
            }
            const batch = await prisma.media.findMany({
                where: {
                    organizationId,
                    ...(failedIds.length > 0
                        ? { id: { notIn: failedIds } }
                        : {}),
                },
                select: { id: true, key: true, variants: true, bucket: true },
                orderBy: { id: "asc" },
                take: 100,
            });
            if (batch.length === 0) break;
            for (const media of batch) {
                try {
                    await this.deleteFiles(media);
                    logDeletionProviderCall(deletionLog, {
                        organizationId,
                        provider: "storage",
                        call: "object.delete",
                        result: "ok",
                        ref: media.id,
                    });
                } catch (error) {
                    logDeletionProviderCall(deletionLog, {
                        organizationId,
                        provider: "storage",
                        call: "object.delete",
                        result: errorResult(error),
                        ref: media.id,
                    });
                    failedIds.push(media.id);
                    continue;
                }
                await prisma.media.deleteMany({
                    where: { id: media.id, organizationId },
                });
                removed += 1;
            }
        }
        const failed = failedIds.length;
        if (failed > 0) {
            throw new Error(
                `media_remove_incomplete removed=${removed} failed=${failed}`,
            );
        }
        return { removed, failed, stopped };
    }

    /**
     * The address a READY library object is served from, for another module
     * that stores a reference to it (a product photo). Tenant-scoped: another
     * organization's id, or one still uploading, is not found. Null when
     * storage has no public base configured (local dev without R2).
     */
    async readyObject(
        organizationId: string,
        mediaId: string,
    ): Promise<{
        id: string;
        url: string | null;
        contentType: string;
        sizeBytes: number;
        /** Its size, blur and copies' widths, when made at upload (DEC-246). */
        width: number | null;
        height: number | null;
        placeholder: string | null;
        widths: number[];
    }> {
        const media = await prisma.media.findUnique({
            where: { id: mediaId },
            select: {
                id: true,
                organizationId: true,
                key: true,
                bucket: true,
                status: true,
                contentType: true,
                sizeBytes: true,
                width: true,
                height: true,
                placeholder: true,
                variants: true,
            },
        });
        if (
            media?.organizationId !== organizationId ||
            media.status !== "READY"
        ) {
            throw new NotFoundException("That photo is not in your library");
        }
        return {
            id: media.id,
            url: this.publicUrlFor(media),
            contentType: media.contentType,
            sizeBytes: media.sizeBytes,
            width: media.width,
            height: media.height,
            placeholder: media.placeholder,
            widths: variantWidths(media.variants),
        };
    }

    /**
     * Images for one Ask AI message (owner, 22 Nov): the business's own, READY,
     * an image Anthropic reads, at most 5 MB; each by its id, in the order given.
     * Another business's id is "not found", as everywhere in media.
     */
    async askAiImages(
        organizationId: string,
        ids: readonly string[],
    ): Promise<
        {
            id: string;
            filename: string;
            contentType: string;
            sizeBytes: number;
        }[]
    > {
        const rows = await prisma.media.findMany({
            where: { id: { in: [...ids] }, organizationId, status: "READY" },
            select: {
                id: true,
                filename: true,
                contentType: true,
                sizeBytes: true,
            },
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        return ids.map((id) => {
            const r = byId.get(id);
            if (!r) throw new NotFoundException("That image isn't here");
            if (
                !(ASK_AI_IMAGE_TYPES as readonly string[]).includes(
                    r.contentType,
                )
            ) {
                throw new BadRequestException(ASK_AI_NOT_IMAGE_MESSAGE);
            }
            if (r.sizeBytes > ASK_AI_IMAGE_MAX_BYTES) {
                throw new BadRequestException(ASK_AI_TOO_BIG_MESSAGE);
            }
            return {
                id: r.id,
                filename: r.filename,
                contentType: r.contentType,
                sizeBytes: r.sizeBytes,
            };
        });
    }

    /** Links for images already sent: signed and short-lived while private, public once applied; only those still there. */
    async askAiImageViews(
        organizationId: string,
        ids: readonly string[],
    ): Promise<
        Map<string, { mediaId: string; url: string; filename: string }>
    > {
        if (!ids.length) return new Map();
        const rows = await prisma.media.findMany({
            where: { id: { in: [...ids] }, organizationId, status: "READY" },
            select: {
                id: true,
                key: true,
                bucket: true,
                purpose: true,
                filename: true,
            },
        });
        const views = await Promise.all(
            rows.map(async (r) => ({ r, url: await this.viewUrlFor(r) })),
        );
        return new Map(
            views.flatMap(({ r, url }) =>
                url
                    ? [[r.id, { mediaId: r.id, url, filename: r.filename }]]
                    : [],
            ),
        );
    }

    /**
     * A READY image's whole bytes (at most 5 MB) for the provider; null when
     * gone. Local development's in-memory storage never sees the browser's
     * PUT (#873), so there Ask AI is given a one-pixel stand-in instead of a
     * failed turn; R2 (`seesUploads`) is always read for real.
     */
    async readAskAiImage(
        organizationId: string,
        id: string,
    ): Promise<{ bytes: Uint8Array; contentType: string } | null> {
        const media = await prisma.media.findUnique({
            where: { id },
            select: {
                organizationId: true,
                key: true,
                bucket: true,
                status: true,
                contentType: true,
            },
        });
        if (
            media?.organizationId !== organizationId ||
            media.status !== "READY"
        ) {
            return null;
        }
        const storage = this.storages.of(media.bucket);
        const bytes = await storage.readObjectStart(
            media.key,
            ASK_AI_IMAGE_MAX_BYTES,
        );
        if (bytes) return { bytes, contentType: media.contentType };
        return storage.seesUploads
            ? null
            : { bytes: STAND_IN_PNG, contentType: "image/png" };
    }

    /**
     * A question carries these images: from now on they are kept for their
     * conversation's days, not swept as never used. Only a fresh Ask AI
     * upload changes; a photo from Your photos is left as it is.
     */
    async markAskAiImagesSent(
        organizationId: string,
        ids: readonly string[],
    ): Promise<void> {
        await prisma.media.updateMany({
            where: {
                id: { in: [...ids] },
                organizationId,
                purpose: ASK_AI_IMAGE_PURPOSE,
            },
            data: { purpose: ASK_AI_SENT_PURPOSE },
        });
    }

    /**
     * Ask AI images never sent with a question (picked, then left) go after
     * `before`, files and rows; one a question carried is the conversation's
     * (`deleteAskAiImages`). A business on legal hold keeps them. Returns how many went.
     */
    async deleteUnsentAskAiImagesBefore(
        before: Date,
        heldOrganizationIds: readonly string[],
        take = 200,
    ): Promise<number> {
        return this.deleteWhere(
            {
                purpose: ASK_AI_IMAGE_PURPOSE,
                createdAt: { lt: before },
                ...(heldOrganizationIds.length
                    ? { organizationId: { notIn: [...heldOrganizationIds] } }
                    : {}),
            },
            take,
        );
    }

    /** The images a deleted conversation carried, if never applied: files and rows. */
    async deleteAskAiImages(ids: readonly string[]): Promise<number> {
        if (!ids.length) return 0;
        return this.deleteWhere(
            { id: { in: [...ids] }, purpose: ASK_AI_SENT_PURPOSE },
            ids.length,
        );
    }

    private async deleteWhere(
        where: Prisma.MediaWhereInput,
        take: number,
    ): Promise<number> {
        const rows = await prisma.media.findMany({
            where,
            take,
            select: { id: true, key: true, bucket: true, variants: true },
        });
        for (const row of rows) await this.deleteFiles(row);
        const gone = await prisma.media.deleteMany({
            where: { id: { in: rows.map((r) => r.id) }, ...where },
        });
        return gone.count;
    }

    /**
     * An Ask AI image that was applied now belongs to the library: Your photos
     * lists it from here on. Idempotent; any other purpose is left as it is.
     */
    async adoptAskAiImage(
        organizationId: string,
        mediaId: string,
    ): Promise<void> {
        await prisma.media.updateMany({
            where: {
                id: mediaId,
                organizationId,
                purpose: { in: [ASK_AI_IMAGE_PURPOSE, ASK_AI_SENT_PURPOSE] },
            },
            data: { purpose: "site-image" },
        });
    }

    /**
     * The first `length` bytes of a READY library object, read from storage
     * (one ranged GET) — never over HTTP from its public address. For a
     * module that draws the image itself: the invoice PDF prints the logo.
     * Tenant-scoped: another organization's id, one still uploading, or one
     * whose bytes are gone is null. Storage errors propagate.
     */
    async readReadyObjectStart(
        organizationId: string,
        mediaId: string,
        length: number,
    ): Promise<{ bytes: Uint8Array; contentType: string } | null> {
        const media = await prisma.media.findUnique({
            where: { id: mediaId },
            select: {
                organizationId: true,
                key: true,
                bucket: true,
                status: true,
                contentType: true,
            },
        });
        if (
            media?.organizationId !== organizationId ||
            media.status !== "READY"
        ) {
            return null;
        }
        const bytes = await this.storages
            .of(media.bucket)
            .readObjectStart(media.key, length);
        return bytes ? { bytes, contentType: media.contentType } : null;
    }

    /**
     * Every file of an upload is the file it said, whole (#517, #873,
     * DEC-246): the photo, and each smaller copy the browser made. First
     * bytes: the format its type says (`storedBytesProblem`). Last bytes:
     * it ends where that format ends, nothing appended
     * (`storedEndProblem`). A copy is the photo's type, and smaller.
     * Two ranged reads and a head per file; nothing is decoded.
     */
    private async checkStoredFiles(media: {
        key: string;
        bucket: MediaBucket;
        contentType: string;
        purpose: string | null;
        sizeBytes: number;
        variants: unknown;
    }): Promise<{
        problem: string | null;
        head: Awaited<ReturnType<ObjectStorage["headObject"]>>;
    }> {
        const storage = this.storages.of(media.bucket);
        const seesUploads = storage.seesUploads;
        const check = async (file: {
            key: string;
            contentType: string;
            purpose: string | null;
        }) => {
            const [start, end, head] = await Promise.all([
                storage.readObjectStart(
                    file.key,
                    isVideoContentType(file.contentType)
                        ? ISO_BMFF_SNIFF_BYTES
                        : IMAGE_SNIFF_BYTES,
                ),
                isVideoContentType(file.contentType)
                    ? Promise.resolve(null)
                    : storage.readObjectEnd(file.key, IMAGE_END_BYTES),
                storage.headObject(file.key),
            ]);
            const problem =
                storedBytesProblem(file, start, seesUploads) ??
                storedEndProblem(
                    file,
                    start,
                    end,
                    head?.contentLength,
                    seesUploads,
                );
            return { problem, head };
        };
        const own = await check(media);
        if (own.problem) return own;
        const ownSize = own.head?.contentLength ?? media.sizeBytes;
        for (const v of storedVariants(media.variants)) {
            const copy = await check({
                key: v.key,
                contentType: media.contentType,
                purpose: media.purpose,
            });
            if (copy.problem) return { problem: copy.problem, head: own.head };
            if ((copy.head?.contentLength ?? v.bytes) >= ownSize) {
                return { problem: BAD_SIZES_MESSAGE, head: own.head };
            }
        }
        return own;
    }

    /** Delete every file of an upload: the photo and its copies. Idempotent. */
    private async deleteFiles(media: {
        key: string;
        bucket: MediaBucket;
        variants: unknown;
    }): Promise<void> {
        const storage = this.storages.of(media.bucket);
        for (const key of mediaFileKeys(media)) {
            await storage.deleteObject(key);
        }
    }

    /**
     * Put an upload's bytes from the server, for an image the API fetched
     * itself (MCP `upload_image`): into the bucket its row was signed for.
     * Then {@link completeUpload} checks them as any other. Refuses a row
     * that is no longer PENDING.
     */
    async storeUploadBytes(
        ctx: OrganizationContext,
        mediaId: string,
        body: Uint8Array,
    ): Promise<void> {
        authorize(ctx, "media:write");
        const media = await this.requireOwned(ctx, mediaId);
        // Only an upload still waiting for its bytes: a confirmed file is
        // never replaced after its checks (F4).
        if (media.status !== "PENDING") {
            throw new ConflictException("This upload is already finished.");
        }
        await this.storages.of(media.bucket).putObject(media.key, body, {
            contentType: media.contentType,
            contentLength: media.sizeBytes,
        });
    }

    /**
     * Load a media row and assert it belongs to `ctx.organizationId`. Throws
     * `NotFoundException` for a missing OR cross-tenant id — a 404 (not 403) so a
     * caller can't probe which media ids exist in another org.
     */
    private async requireOwned(ctx: OrganizationContext, mediaId: string) {
        const media = await prisma.media.findUnique({
            where: { id: mediaId },
        });
        if (media?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Media not found");
        }
        return media;
    }
}
