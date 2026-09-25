import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { MediaService } from "../media/media.service";
import type {
    ProductImageInput,
    ProductMediaKind,
    ReplaceProductImagesDto,
} from "./dto";
import {
    PHOTO_LIMIT_MESSAGE,
    PRODUCT_IMAGE_LIMIT,
    PRODUCT_VIDEO_LIMIT,
    VIDEO_LIMIT_MESSAGE,
} from "./dto";
import type { ProductScope } from "./product-access";
import { ProductsService } from "./products.service";
import type { ProductImageDto } from "./serialize";
import { serializeImage } from "./serialize";

interface ExistingImage {
    id: string;
    url: string;
    mediaId: string | null;
    alt: string;
    width: number | null;
    height: number | null;
    creditName: string | null;
    creditUrl: string | null;
    kind: string;
    durationSec: number | null;
    posterMediaId: string | null;
    posterUrl: string | null;
}

interface ResolvedImage {
    id?: string;
    url: string;
    mediaId: string | null;
    alt: string;
    width: number | null;
    height: number | null;
    creditName: string | null;
    creditUrl: string | null;
    kind: ProductMediaKind;
    durationSec: number | null;
    posterMediaId: string | null;
    posterUrl: string | null;
}

/** The two video types a product takes (#517). No transcoding. */
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime"]);

/**
 * A product's photos and videos, saved as one ordered set — the editor's
 * Photos and videos section and the product page's photo sheet both send the
 * whole list, in the order customers see it. The first photo is the cover.
 *
 * Replacing the set rather than patching one item at a time is what keeps
 * position honest: there is never a moment with two covers or a gap. Items
 * left out are taken off this product only; the library object behind one
 * (Media) is never touched — "Remove ≠ delete".
 *
 * Up to 15 photos and 3 videos. A video is an uploaded MP4 or MOV (its bytes
 * were checked when the upload completed) and its poster is a library image;
 * a photo is an image. Neither may point at the other's kind of file.
 *
 * The cover is mirrored onto `Product.image` in the same transaction, so the
 * products list, orders and imports — which read that one string — never show
 * a stale picture, and never a video.
 */
@Injectable()
export class ProductImagesService {
    constructor(
        private readonly products: ProductsService,
        private readonly media: MediaService,
    ) {}

    async list(
        storeId: string,
        productId: string,
        userId: string,
    ): Promise<ProductImageDto[]> {
        return this.listIn(
            await this.products.access.readViaStore(storeId, userId, productId),
            productId,
        );
    }

    async listIn(
        _scope: ProductScope,
        productId: string,
    ): Promise<ProductImageDto[]> {
        const rows = await prisma.productImage.findMany({
            where: { productId },
            orderBy: { position: "asc" },
        });
        return rows.map(serializeImage);
    }

    async replace(
        storeId: string,
        productId: string,
        userId: string,
        dto: ReplaceProductImagesDto,
    ): Promise<ProductImageDto[]> {
        return this.replaceIn(
            await this.products.access.writeViaStore(
                storeId,
                userId,
                productId,
            ),
            productId,
            dto,
        );
    }

    async replaceIn(
        scope: ProductScope,
        productId: string,
        dto: ReplaceProductImagesDto,
    ): Promise<ProductImageDto[]> {
        const { organizationId } = scope;

        const existing = await prisma.productImage.findMany({
            where: { productId },
        });
        const byId = new Map(existing.map((row) => [row.id, row]));

        // Count by kind before resolving anything, so a set over the limit is
        // refused with the limit's own words rather than a lookup error.
        const kinds = dto.images.map(
            (input) =>
                (input.id ? byId.get(input.id)?.kind : input.kind) ?? "photo",
        );
        if (kinds.filter((k) => k !== "video").length > PRODUCT_IMAGE_LIMIT) {
            throw new BadRequestException({
                message: PHOTO_LIMIT_MESSAGE,
                field: "images",
            });
        }
        if (kinds.filter((k) => k === "video").length > PRODUCT_VIDEO_LIMIT) {
            throw new BadRequestException({
                message: VIDEO_LIMIT_MESSAGE,
                field: "images",
            });
        }

        const resolved: ResolvedImage[] = [];
        for (const input of dto.images) {
            resolved.push(await this.resolve(organizationId, input, byId));
        }
        const keptIds = new Set(
            resolved.flatMap((image) => (image.id ? [image.id] : [])),
        );
        if (keptIds.size !== resolved.filter((i) => i.id).length) {
            throw new BadRequestException({
                message: "The same photo is listed twice",
                field: "images",
            });
        }

        await prisma.$transaction(async (tx) => {
            // Taking a photo off also clears it as a variant's photo and as
            // the sharing image (onDelete: SetNull) — both fall back to the
            // cover, which is what a merchant would expect.
            await tx.productImage.deleteMany({
                where: { productId, id: { notIn: [...keptIds] } },
            });
            for (const [position, image] of resolved.entries()) {
                const data = {
                    url: image.url,
                    mediaId: image.mediaId,
                    alt: image.alt,
                    width: image.width,
                    height: image.height,
                    creditName: image.creditName,
                    creditUrl: image.creditUrl,
                    kind: image.kind,
                    durationSec: image.durationSec,
                    posterMediaId: image.posterMediaId,
                    posterUrl: image.posterUrl,
                    position,
                };
                if (image.id) {
                    await tx.productImage.update({
                        where: { id: image.id },
                        data,
                    });
                } else {
                    await tx.productImage.create({
                        data: { ...data, productId, organizationId },
                    });
                }
            }
            await tx.product.update({
                where: { id: productId },
                data: {
                    image:
                        resolved.find((image) => image.kind === "photo")?.url ??
                        null,
                },
            });
        });

        return this.listIn(scope, productId);
    }

    /** Turn one input into a row to write, checking where it comes from. */
    private async resolve(
        organizationId: string,
        input: ProductImageInput,
        existing: Map<string, ExistingImage>,
    ): Promise<ResolvedImage> {
        const sources = [input.id, input.mediaId, input.url].filter(Boolean);
        if (sources.length !== 1) {
            throw new BadRequestException({
                message:
                    "Each photo needs exactly one of: a photo already on it, one from your library, or an address",
                field: "images",
            });
        }
        const common = {
            alt: input.alt ?? "",
            width: input.width ?? null,
            height: input.height ?? null,
            creditName: input.creditName ?? null,
            creditUrl: input.creditUrl ?? null,
        };

        if (input.id) {
            const row = existing.get(input.id);
            if (!row) {
                throw new NotFoundException(
                    "That photo is not on this product",
                );
            }
            const kind: ProductMediaKind =
                row.kind === "video" ? "video" : "photo";
            // A kept item keeps what the request leaves out: moving it must
            // not wipe its alt text, credit, duration or poster.
            return {
                id: row.id,
                url: row.url,
                mediaId: row.mediaId,
                alt: input.alt ?? row.alt,
                width: input.width ?? row.width,
                height: input.height ?? row.height,
                creditName:
                    input.creditName === undefined
                        ? row.creditName
                        : common.creditName,
                creditUrl:
                    input.creditUrl === undefined
                        ? row.creditUrl
                        : common.creditUrl,
                kind,
                durationSec:
                    kind === "video"
                        ? input.durationSec === undefined
                            ? row.durationSec
                            : input.durationSec
                        : null,
                ...(kind === "video"
                    ? input.posterMediaId === undefined
                        ? {
                              posterMediaId: row.posterMediaId,
                              posterUrl: row.posterUrl,
                          }
                        : await this.poster(organizationId, input.posterMediaId)
                    : { posterMediaId: null, posterUrl: null }),
            };
        }

        if ((input.kind ?? "photo") === "video") {
            if (!input.mediaId) {
                throw new BadRequestException({
                    message:
                        "A video has to be uploaded — an address can't be one.",
                    field: "images",
                });
            }
            const object = await this.media.readyObject(
                organizationId,
                input.mediaId,
            );
            if (!VIDEO_TYPES.has(object.contentType)) {
                throw new BadRequestException({
                    message: "That file is not a video. Choose an MP4 or MOV.",
                    field: "images",
                });
            }
            return {
                ...common,
                url: this.servable(object.url),
                mediaId: object.id,
                kind: "video",
                durationSec: input.durationSec ?? null,
                ...(await this.poster(
                    organizationId,
                    input.posterMediaId ?? null,
                )),
            };
        }

        if (input.posterMediaId || input.durationSec != null) {
            throw new BadRequestException({
                message: "Only a video has a poster and a length.",
                field: "images",
            });
        }
        const photo = {
            kind: "photo" as const,
            durationSec: null,
            posterMediaId: null,
            posterUrl: null,
        };
        if (input.mediaId) {
            const object = await this.media.readyObject(
                organizationId,
                input.mediaId,
            );
            if (!object.contentType.startsWith("image/")) {
                throw new BadRequestException({
                    message:
                        "That file is not a photo. Add a video as a video.",
                    field: "images",
                });
            }
            return {
                ...common,
                ...photo,
                url: this.servable(object.url),
                mediaId: object.id,
            };
        }
        return { ...common, ...photo, url: input.url ?? "", mediaId: null };
    }

    /** A video's poster: a READY image of this business, or none. */
    private async poster(
        organizationId: string,
        posterMediaId: string | null,
    ): Promise<{ posterMediaId: string | null; posterUrl: string | null }> {
        if (!posterMediaId) return { posterMediaId: null, posterUrl: null };
        const object = await this.media.readyObject(
            organizationId,
            posterMediaId,
        );
        if (!object.contentType.startsWith("image/")) {
            throw new BadRequestException({
                message: "A video's poster has to be a photo.",
                field: "images",
            });
        }
        return {
            posterMediaId: object.id,
            posterUrl: this.servable(object.url),
        };
    }

    /** The address a library object is shown from, or a clear refusal. */
    private servable(url: string | null): string {
        if (!url) {
            throw new BadRequestException({
                message:
                    "Photos can't be shown yet: storage has no public address set up.",
                field: "images",
            });
        }
        return url;
    }
}
