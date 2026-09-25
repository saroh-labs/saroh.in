import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { MediaService } from "../media/media.service";
import type { ProductImageInput, ReplaceProductImagesDto } from "./dto";
import { PRODUCT_IMAGE_LIMIT } from "./dto";
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
}

/**
 * A product's photos, saved as one ordered set — the editor's Photos section
 * and the product page's photo sheet both send the whole list, in the order
 * customers see it. The first is the cover.
 *
 * Replacing the set rather than patching one photo at a time is what keeps
 * position honest: there is never a moment with two covers or a gap. Photos
 * left out are taken off this product only; the library object behind one
 * (Media) is never touched — "Remove ≠ delete".
 *
 * The cover is mirrored onto `Product.image` in the same transaction, so the
 * products list, orders and imports — which read that one string — never show
 * a stale picture.
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
        await this.products.assertProductReadable(storeId, productId, userId);
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
        const organizationId = await this.products.assertProductWritable(
            storeId,
            productId,
            userId,
        );
        if (!organizationId) {
            // Legacy org-less stores predate the photo set; nothing to scope by.
            throw new BadRequestException(
                "This storefront is not attached to a business, so it can't hold photos.",
            );
        }
        if (dto.images.length > PRODUCT_IMAGE_LIMIT) {
            throw new BadRequestException({
                message: `A product can have ${PRODUCT_IMAGE_LIMIT} photos at most — take one off first.`,
                field: "images",
            });
        }

        const existing = await prisma.productImage.findMany({
            where: { productId },
        });
        const byId = new Map(existing.map((row) => [row.id, row]));
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
                data: { image: resolved[0]?.url ?? null },
            });
        });

        return this.list(storeId, productId, userId);
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
            // A kept photo keeps what the request leaves out: moving it must
            // not wipe its alt text or credit.
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
            };
        }
        if (input.mediaId) {
            const object = await this.media.readyObject(
                organizationId,
                input.mediaId,
            );
            if (!object.url) {
                throw new BadRequestException({
                    message:
                        "Photos can't be shown yet: storage has no public address set up.",
                    field: "images",
                });
            }
            return { ...common, url: object.url, mediaId: object.id };
        }
        return { ...common, url: input.url ?? "", mediaId: null };
    }
}
