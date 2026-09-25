import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { readShopFields } from "./serialize";

/**
 * Duplicate a catalogue product (#518): a draft to start the next one from.
 *
 * The copy is a DRAFT named "… (copy)", with every detail, variant, custom
 * field value and allergen of the original. Photos and videos are copied by
 * reference — the same media, never new files — and only media of the same
 * business (a row pointing anywhere else is left behind). It is sold where
 * the original is sold (open storefronts, the same variants), and counts
 * stock the same way at 0: its StockLevel rows start empty, and a row at 0
 * with no entries already adds up, so it needs no opening entry.
 *
 * Its slug and variant SKUs take the first free suffix in the business:
 * "-copy", then "-copy-2", "-copy-3" — one number for both, so a second copy
 * never clashes with the first.
 */

type Tx = Prisma.TransactionClient;

/** How many suffixes to try before giving up; a guard, not a limit anyone meets. */
const MAX_COPIES = 100;

/** "-copy", "-copy-2", … */
export function copySuffix(n: number): string {
    return n === 1 ? "-copy" : `-copy-${n}`;
}

/**
 * The first copy number whose slug and SKUs are all free in the business.
 * Slugs are unique per business; SKUs only per product, but a copy's SKUs
 * are kept apart from every other product's so a stock count or an import
 * never has to guess which is meant.
 */
async function freeCopyNumber(
    tx: Tx,
    organizationId: string,
    slug: string,
    skus: readonly string[],
): Promise<number> {
    for (let n = 1; n <= MAX_COPIES; n++) {
        const suffix = copySuffix(n);
        const [slugTaken, skuTaken] = await Promise.all([
            tx.product.count({
                where: { organizationId, slug: `${slug}${suffix}` },
            }),
            skus.length === 0
                ? Promise.resolve(0)
                : tx.productVariant.count({
                      where: {
                          product: { organizationId },
                          sku: { in: skus.map((s) => `${s}${suffix}`) },
                      },
                  }),
        ]);
        if (slugTaken === 0 && skuTaken === 0) return n;
    }
    throw new Error(`No free copy suffix for ${slug} after ${MAX_COPIES}`);
}

/**
 * Make the copy inside the caller's transaction and return its id. The
 * caller has checked the caller may change the business's products.
 */
export async function duplicateProduct(
    tx: Tx,
    input: { organizationId: string; productId: string; storeId: string },
): Promise<string> {
    const { organizationId, productId, storeId } = input;
    const source = await tx.product.findFirst({
        where: { id: productId, organizationId },
        include: {
            images: { orderBy: { position: "asc" } },
            variants: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
            listings: {
                where: { store: { deletedAt: null } },
                select: {
                    storeId: true,
                    variants: { select: { variantId: true } },
                },
            },
            stockLevels: {
                select: { storeId: true, variantId: true, lowStockAlert: true },
            },
            fieldValues: { select: { fieldId: true, value: true } },
            allergens: { select: { allergenId: true, kind: true } },
        },
    });
    if (!source) throw new NotFoundException("Product not found");

    const n = await freeCopyNumber(
        tx,
        organizationId,
        source.slug,
        source.variants.map((v) => v.sku),
    );
    const suffix = copySuffix(n);

    const copy = await tx.product.create({
        data: {
            organizationId,
            storeId,
            name: `${source.name} (copy)`,
            slug: `${source.slug}${suffix}`,
            description: source.description,
            image: source.image,
            categoryId: source.categoryId,
            price: source.price,
            mrp: source.mrp,
            currency: source.currency,
            status: "DRAFT",
            archivedAt: null,
            howToUse: source.howToUse,
            materials: source.materials,
            keyPoints: source.keyPoints,
            madeHere: source.madeHere,
            maker: source.maker,
            madeIn: source.madeIn,
            supplierCode: source.supplierCode,
            warranty: source.warranty,
            returnsMode: source.returnsMode,
            returnsText: source.returnsText,
            shopFields: readShopFields(source.shopFields),
            gstRate: source.gstRate,
            hsnCode: source.hsnCode,
            seoTitle: source.seoTitle,
            seoDescription: source.seoDescription,
            optionId: source.optionId,
            // Tracks stock as the original does (#515), from 0.
            stockTracked: source.stockTracked,
            stockTrackedAt: source.stockTracked ? new Date() : null,
        },
        select: { id: true },
    });

    // Photos and videos by reference, only the business's own media.
    const mediaIds = source.images.flatMap((i) =>
        [i.mediaId, i.posterMediaId].filter((id): id is string => id !== null),
    );
    const ours = new Set(
        mediaIds.length === 0
            ? []
            : (
                  await tx.media.findMany({
                      where: { id: { in: mediaIds }, organizationId },
                      select: { id: true },
                  })
              ).map((m) => m.id),
    );
    const imageIds = new Map<string, string>();
    for (const image of source.images) {
        if (image.mediaId !== null && !ours.has(image.mediaId)) continue;
        const poster =
            image.posterMediaId !== null && ours.has(image.posterMediaId);
        const made = await tx.productImage.create({
            data: {
                organizationId,
                productId: copy.id,
                url: image.url,
                mediaId: image.mediaId,
                alt: image.alt,
                width: image.width,
                height: image.height,
                position: image.position,
                kind: image.kind,
                durationSec: image.durationSec,
                posterMediaId: poster ? image.posterMediaId : null,
                posterUrl: poster ? image.posterUrl : null,
                creditName: image.creditName,
                creditUrl: image.creditUrl,
            },
            select: { id: true },
        });
        imageIds.set(image.id, made.id);
    }
    const seoImageId = source.seoImageId
        ? (imageIds.get(source.seoImageId) ?? null)
        : null;
    if (seoImageId) {
        await tx.product.update({
            where: { id: copy.id },
            data: { seoImageId },
        });
    }

    const variantIds = new Map<string, string>();
    for (const variant of source.variants) {
        const made = await tx.productVariant.create({
            data: {
                productId: copy.id,
                sku: `${variant.sku}${suffix}`,
                title: variant.title,
                price: variant.price,
                mrp: variant.mrp,
                image: variant.image,
                optionValueId: variant.optionValueId,
                imageId: variant.imageId
                    ? (imageIds.get(variant.imageId) ?? null)
                    : null,
                position: variant.position,
            },
            select: { id: true },
        });
        variantIds.set(variant.id, made.id);
    }
    const asCopy = (variantId: string | null) =>
        variantId === null ? null : (variantIds.get(variantId) ?? null);

    // Sold where the original is sold, the same variants at each.
    const listedAt = new Set<string>();
    for (const listing of source.listings) {
        const made = await tx.productListing.create({
            data: {
                organizationId,
                storeId: listing.storeId,
                productId: copy.id,
            },
            select: { id: true },
        });
        listedAt.add(listing.storeId);
        const sold = listing.variants.flatMap((v) => {
            const id = asCopy(v.variantId);
            return id ? [id] : [];
        });
        if (sold.length > 0) {
            await tx.productListingVariant.createMany({
                data: sold.map((variantId) => ({
                    organizationId,
                    listingId: made.id,
                    productId: copy.id,
                    variantId,
                })),
            });
        }
    }

    // Counted the same way, from 0, where it is sold.
    const shelves = source.stockLevels.filter((r) => listedAt.has(r.storeId));
    if (shelves.length > 0) {
        await tx.stockLevel.createMany({
            data: shelves.map((r) => ({
                organizationId,
                storeId: r.storeId,
                productId: copy.id,
                variantId: asCopy(r.variantId),
                lowStockAlert: r.lowStockAlert,
            })),
        });
    }

    if (source.fieldValues.length > 0) {
        await tx.productFieldValue.createMany({
            data: source.fieldValues.map((f) => ({
                organizationId,
                productId: copy.id,
                fieldId: f.fieldId,
                value: f.value,
            })),
        });
    }
    if (source.allergens.length > 0) {
        await tx.productAllergen.createMany({
            data: source.allergens.map((a) => ({
                organizationId,
                productId: copy.id,
                allergenId: a.allergenId,
                kind: a.kind,
            })),
        });
    }
    return copy.id;
}
