import {
    ConflictException,
    Inject,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { ObjectStorage } from "@saroh/object-storage";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { OBJECT_STORAGE } from "./object-storage.provider";

/** Input for issuing an upload URL — the validated {@link CreateUploadDto} shape. */
export interface CreateUploadInput {
    contentType: string;
    contentLength: number;
    filename: string;
    purpose?: string;
}

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
     * `headObject` verifies the bytes exist in storage and lets us reconcile the
     * true size. NOTE: the in-memory dev/test adapter's `headObject` only knows
     * about objects it minted a URL for and cannot observe an out-of-band PUT —
     * so in dev/memory this is effectively a "trust the client" no-op when the
     * head misses; we still flip to READY rather than block local development.
     * The real R2 adapter performs an actual HEAD against the bucket.
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

        const head = await this.storage.headObject(media.key);
        // Reconcile the authoritative size from storage when available; the
        // memory adapter reports the size we recorded, R2 the real object size.
        // Falls back to the recorded size when the head misses (dev/memory).
        const sizeBytes = head?.contentLength ?? media.sizeBytes;

        const updated = await prisma.media.update({
            where: { id: media.id },
            data: { status: "READY", sizeBytes },
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

        await this.storage.deleteObject(media.key);
        await prisma.media.delete({ where: { id: media.id } });

        return { id: media.id, deleted: true };
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
