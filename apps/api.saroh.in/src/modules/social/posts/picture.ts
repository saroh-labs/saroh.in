import { randomUUID } from "node:crypto";

import { ConflictException, NotFoundException } from "@nestjs/common";
import type { ObjectStorage } from "@saroh/object-storage";
import { buildObjectKey } from "@saroh/object-storage";

import type { MediaService } from "../../media/media.service";
import type { MediaStorages } from "../../media/object-storage.provider";
import { renderPhotoJpeg } from "../../share-posts/cards/card-renderer";
import type { PublicShareService } from "../../share-posts/public-share.service";

/** What Saroh draws for a post. */
export interface PictureInput {
    organizationId: string;
    sourceKind: string;
    sourceRef: string | null;
    picture: string;
    cardStyle: string;
    size: string;
    headline: string | null;
    mediaId: string | null;
}

export interface PictureDeps {
    share: PublicShareService;
    media: MediaService;
    /** The business's edition's bucket, where the picture is stored. */
    storage: ObjectStorage;
}

/** Item kinds drawn as their live page's card; the rest are the business's own words. */
const ITEM_KINDS = new Set(["product", "service", "post", "offer", "book"]);
/** The most of a photo read. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * Draw the post's picture as a JPEG and store it (KTD6): a Share card of
 * the item (or of the business's own words), or its own photo cropped to
 * 4:5 or square, at 1080 wide. Stored under the business and the post, so
 * Meta fetches it from a stable public address whether or not the site is
 * live at the time. An item with no public page is refused before
 * anything is stored: "Publish it first".
 */
export async function drawAndStore(
    deps: PictureDeps,
    input: PictureInput,
): Promise<{ imageKey: string; imageUrl: string }> {
    const size = input.size === "square" ? "square" : "post";
    let jpeg: Buffer;
    try {
        if (input.picture === "photo") {
            const read = input.mediaId
                ? await deps.media.readReadyObjectStart(
                      input.organizationId,
                      input.mediaId,
                      MAX_PHOTO_BYTES,
                  )
                : null;
            if (!read) throw new NotFoundException();
            // A file that isn't a picture Saroh can draw reads as missing.
            jpeg = await renderPhotoJpeg(read.bytes, size).catch(() => {
                throw new NotFoundException();
            });
        } else {
            jpeg = await deps.share.socialCard(input.organizationId, {
                kind: ITEM_KINDS.has(input.sourceKind)
                    ? (input.sourceKind as "product")
                    : "own",
                ref: input.sourceRef,
                headline: input.headline,
                mediaId: input.mediaId,
                style: input.cardStyle,
                size,
            });
        }
    } catch (error) {
        if (error instanceof NotFoundException) throw notPublic(input);
        throw error;
    }
    const imageKey = buildObjectKey({
        organizationId: input.organizationId,
        purpose: "social",
        filename: "post.jpg",
        uuid: randomUUID(),
    });
    await deps.storage.putObject(imageKey, jpeg, {
        contentType: "image/jpeg",
        contentLength: jpeg.length,
    });
    return { imageKey, imageUrl: deps.storage.getPublicUrl(imageKey) };
}

function notPublic(input: PictureInput): ConflictException {
    if (input.picture === "photo") {
        return new ConflictException({
            message: "That photo isn't ready in your media. Pick another.",
            details: { code: "SOCIAL_PHOTO_MISSING" },
        });
    }
    return new ConflictException({
        message: ITEM_KINDS.has(input.sourceKind)
            ? "Publish it first. A draft has no public page."
            : "Your website isn't live yet. Put it live first: posts link to it.",
        details: { code: "SOCIAL_NOT_PUBLIC" },
    });
}

/**
 * Remove a stored picture from the bucket its address is in (owner, 22 Nov
 * 2026); a failure leaves a file, never a broken post.
 */
export async function removePicture(
    storages: Pick<MediaStorages, "servingUrl">,
    picture: { imageKey: string | null; imageUrl: string | null } | null,
): Promise<void> {
    if (!picture?.imageKey || !picture.imageUrl) return;
    const storage = storages.servingUrl(picture.imageKey, picture.imageUrl);
    await storage?.deleteObject(picture.imageKey).catch(() => undefined);
}
