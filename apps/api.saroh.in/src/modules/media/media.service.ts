import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { ObjectStorage } from "@saroh/object-storage";
import {
    IMAGE_SNIFF_BYTES,
    ISO_BMFF_SNIFF_BYTES,
    isVideoContentType,
} from "@saroh/object-storage";

import type { OrganizationContext } from "../../common/types/organization-context";
import { BYTES_PER_GB } from "../billing/metering";
import { planMeter } from "../billing/metering.service";
import { authorize } from "../organizations/organization-policy";
import { OBJECT_STORAGE } from "./object-storage.provider";
import type { CreateUploadInput } from "./upload-checks";
import {
    assertUploadType,
    NOTHING_UPLOADED_MESSAGE,
    storedBytesProblem,
} from "./upload-checks";

/** What the client needs to PUT the file directly to storage. */
export interface CreateUploadResult {
    mediaId: string;
    uploadUrl: string;
    method: "PUT";
    headers: Record<string, string>;
    key: string;
    expiresAt: string;
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
@Injectable()
export class MediaService {
    constructor(
        @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
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
        authorize(ctx, "media:write");
        assertUploadType(input);

        const signed = await this.storage.createSignedUploadUrl({
            organizationId: ctx.organizationId,
            contentType: input.contentType,
            contentLength: input.contentLength,
            filename: input.filename,
            purpose: input.purpose,
        });

        const media = await prisma.media.create({
            data: {
                organizationId: ctx.organizationId,
                key: signed.key,
                contentType: input.contentType,
                sizeBytes: input.contentLength,
                filename: input.filename,
                purpose: input.purpose ?? null,
                status: "PENDING",
                uploadedByUserId: ctx.userId,
            },
        });

        return {
            mediaId: media.id,
            uploadUrl: signed.url,
            method: signed.method,
            headers: signed.headers,
            key: signed.key,
            expiresAt: signed.expiresAt,
        };
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
        authorize(ctx, "media:write");

        const media = await this.requireOwned(ctx, mediaId);
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
        const start = await this.storage.readObjectStart(
            media.key,
            isVideoContentType(media.contentType)
                ? ISO_BMFF_SNIFF_BYTES
                : IMAGE_SNIFF_BYTES,
        );
        const problem = storedBytesProblem(
            media,
            start,
            this.storage.seesUploads,
        );
        if (problem) {
            await prisma.media.update({
                where: { id: media.id },
                data: { status: "FAILED" },
            });
            await this.storage.deleteObject(media.key);
            throw new BadRequestException(problem);
        }

        const head = await this.storage.headObject(media.key);
        // Reconcile the authoritative size from storage when available; the
        // memory adapter reports the size we recorded, R2 the real object size.
        // Falls back to the recorded size when the head misses (dev/memory).
        const sizeBytes = head?.contentLength ?? media.sizeBytes;

        // The plan's storage (`storageGb`) is soft: counted, and the
        // business told when it passes its space, never refused. Checked on
        // the write's transaction while this file is still PENDING, so the
        // count is what was there before it.
        const updated = await planMeter.withRoom(
            ctx.organizationId,
            "storage",
            (db) =>
                db.media.update({
                    where: { id: media.id },
                    data: { status: "READY", sizeBytes },
                }),
            {
                soft: true,
                // Confirming again adds nothing it hadn't already counted.
                adding: media.status === "READY" ? 0 : sizeBytes / BYTES_PER_GB,
            },
        );

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
            url: this.publicUrlFor(updated.key),
        };
    }

    /** List the org's media, newest first. Tenant-scoped by ctx. */
    async list(ctx: OrganizationContext) {
        authorize(ctx, "media:read");
        const rows = await prisma.media.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
        });
        return rows.map((row) => ({ ...row, url: this.publicUrlFor(row.key) }));
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
    private publicUrlFor(key: string): string | null {
        try {
            return this.storage.getPublicUrl(key);
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

        await this.storage.deleteObject(media.key);
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
     * Run by `organization.deletion.cleanup` with no caller context, in
     * batches; a storage failure leaves that row for the retry (and out of
     * this run's next batch), the rest go on, and the call throws at the end.
     */
    async removeAllForDeletedBusiness(
        organizationId: string,
    ): Promise<{ removed: number; failed: number }> {
        // A row removed is gone from the next read; only failures are kept
        // out of it, so a batch that always fails can't loop.
        const failedIds: string[] = [];
        let removed = 0;
        for (;;) {
            const batch = await prisma.media.findMany({
                where: {
                    organizationId,
                    ...(failedIds.length > 0
                        ? { id: { notIn: failedIds } }
                        : {}),
                },
                select: { id: true, key: true },
                orderBy: { id: "asc" },
                take: 100,
            });
            if (batch.length === 0) break;
            for (const media of batch) {
                try {
                    await this.storage.deleteObject(media.key);
                } catch {
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
        return { removed, failed };
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
    }> {
        const media = await prisma.media.findUnique({
            where: { id: mediaId },
            select: {
                id: true,
                organizationId: true,
                key: true,
                status: true,
                contentType: true,
                sizeBytes: true,
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
            url: this.publicUrlFor(media.key),
            contentType: media.contentType,
            sizeBytes: media.sizeBytes,
        };
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
        const bytes = await this.storage.readObjectStart(media.key, length);
        return bytes ? { bytes, contentType: media.contentType } : null;
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
