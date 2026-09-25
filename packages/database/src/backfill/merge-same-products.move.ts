/**
 * #530 — join one product into another that is clearly the same
 * (`merge-same-products.ts` decides which). Everything that named the one
 * that goes is re-pointed, in the lock order Product → StockLevel rows by
 * id, before it is removed:
 *
 * - order lines, and the variant each names (mapped by SKU);
 * - its shelves: each StockLevel row moves across with its numbers and the
 *   order lines holding on it; a row at a storefront where the survivor
 *   already has one is added into it;
 * - its listings, with the variants each sells;
 * - reviews;
 * - photos and videos, up to 15 and 3 — the same picture once; a variant
 *   with no photo of its own takes its twin's;
 * - discount codes naming it, once each;
 * - custom field values and allergens — where both have one, the
 *   survivor's value stands, except that "Contains" outranks "May contain";
 * - its old Inventory rows, which nothing reads any more.
 *
 * Then it checks that nothing still names the product or its variants, so
 * removing it cascades nothing away, and removes it. Every value that did
 * not survive comes back for the report.
 */

import type { TransactionClient } from "../transaction";

export interface Discarded {
    /** The product that stayed. */
    productId: string;
    /** The product the value was on. */
    from: string;
    what: string;
    value: string;
}

const PHOTO_LIMIT = 15;
const blank = (v: unknown) =>
    v === null || v === "" || (Array.isArray(v) && v.length === 0);
const VIDEO_LIMIT = 3;

/** Details kept on the product itself: the survivor's stand. */
const DETAILS = [
    "description",
    "howToUse",
    "materials",
    "keyPoints",
    "madeHere",
    "maker",
    "madeIn",
    "supplierCode",
    "warranty",
    "returnsMode",
    "returnsText",
    "shopFields",
    "seoTitle",
    "seoDescription",
    "categoryId",
] as const;

export async function mergeProductInto(
    tx: TransactionClient,
    ids: { organizationId: string; survivorId: string; loserId: string },
): Promise<Discarded[]> {
    const { survivorId, loserId } = ids;
    const discarded: Discarded[] = [];
    const drop = (what: string, value: unknown) =>
        discarded.push({
            productId: survivorId,
            from: loserId,
            what,
            value: typeof value === "string" ? value : JSON.stringify(value),
        });

    await tx.$queryRaw`
        SELECT "id" FROM "Product" WHERE "id" IN (${survivorId}, ${loserId})
        ORDER BY "id" FOR UPDATE`;
    await tx.$queryRaw`
        SELECT "id" FROM "StockLevel" WHERE "productId" IN (${survivorId}, ${loserId})
        ORDER BY "id" FOR UPDATE`;

    const [survivor, loser] = await Promise.all(
        [survivorId, loserId].map((id) =>
            tx.product.findUniqueOrThrow({
                where: { id },
                include: {
                    variants: true,
                    category: { select: { name: true } },
                },
            }),
        ),
    );
    const bySku = new Map(survivor.variants.map((v) => [v.sku, v]));
    const variantMap = new Map(
        loser.variants.map((v) => {
            const twin = bySku.get(v.sku);
            if (!twin) {
                throw new Error(
                    `Variant ${v.sku} of ${loserId} has no twin on ${survivorId}`,
                );
            }
            return [v.id, twin.id];
        }),
    );

    // The address goes. A detail only the loser has fills the gap; one
    // both have, differently, keeps the survivor's.
    drop("address", loser.slug);
    const fill: Record<string, unknown> = {};
    for (const field of DETAILS) {
        const mine = survivor[field];
        const theirs = loser[field];
        if (blank(theirs)) continue;
        if (blank(mine)) {
            fill[field] = theirs;
            continue;
        }
        if (JSON.stringify(mine) === JSON.stringify(theirs)) continue;
        drop(
            field === "categoryId" ? "category" : field,
            field === "categoryId" ? (loser.category?.name ?? "") : theirs,
        );
    }
    if (Object.keys(fill).length > 0) {
        await tx.product.update({
            where: { id: survivorId },
            data: fill,
        });
    }
    for (const v of loser.variants) {
        const twin = bySku.get(v.sku);
        if (twin && twin.title !== v.title) {
            drop(`variant ${v.sku} name`, v.title);
        }
    }

    // Order lines, and the variants they name.
    for (const [from, to] of Array.from(variantMap)) {
        await tx.orderItem.updateMany({
            where: { variantId: from },
            data: { variantId: to, productId: survivorId },
        });
    }
    await tx.orderItem.updateMany({
        where: { productId: loserId },
        data: { productId: survivorId },
    });

    await moveStock(tx, survivorId, loserId, variantMap, drop);
    await moveListings(tx, ids, variantMap);

    await tx.productReview.updateMany({
        where: { productId: loserId },
        data: { productId: survivorId },
    });

    await movePhotos(tx, survivorId, loser, variantMap, drop);

    // Discount codes: each once.
    const codes = await tx.discountProduct.findMany({
        where: { productId: loserId },
        select: { discountId: true },
    });
    await tx.discountProduct.createMany({
        data: codes.map((c) => ({
            discountId: c.discountId,
            productId: survivorId,
        })),
        skipDuplicates: true,
    });
    await tx.discountProduct.deleteMany({ where: { productId: loserId } });

    await moveFieldValues(tx, survivorId, loserId, drop);
    await moveAllergens(tx, survivorId, loserId, drop);

    // Nothing reads these since #510; the listings backfill copied them.
    await tx.variantInventory.deleteMany({ where: { productId: loserId } });
    await tx.inventory.deleteMany({ where: { productId: loserId } });

    await assertNothingNames(tx, loserId, Array.from(variantMap.keys()));
    await tx.product.delete({ where: { id: loserId } });
    return discarded;
}

async function moveStock(
    tx: TransactionClient,
    survivorId: string,
    loserId: string,
    variantMap: Map<string, string>,
    drop: (what: string, value: unknown) => void,
): Promise<void> {
    const rows = await tx.stockLevel.findMany({
        where: { productId: loserId },
        orderBy: { id: "asc" },
    });
    for (const row of rows) {
        const variantId = row.variantId
            ? (variantMap.get(row.variantId) ?? null)
            : null;
        const there = await tx.stockLevel.findFirst({
            where: { storeId: row.storeId, productId: survivorId, variantId },
        });
        if (!there) {
            // In place: its id, numbers and the lines holding on it stay.
            await tx.$executeRaw`
                UPDATE "StockLevel" SET "productId" = ${survivorId}, "variantId" = ${variantId}
                WHERE "id" = ${row.id}`;
            continue;
        }
        // Both at one storefront: one shelf holding both.
        await tx.stockLevel.update({
            where: { id: there.id },
            data: {
                onHand: { increment: row.onHand },
                promised: { increment: row.promised },
            },
        });
        if (there.lowStockAlert !== row.lowStockAlert) {
            drop("low-stock warning", String(row.lowStockAlert));
        }
        await tx.orderItem.updateMany({
            where: { stockLevelId: row.id },
            data: { stockLevelId: there.id },
        });
        await tx.stockLevel.delete({ where: { id: row.id } });
    }
}

async function moveListings(
    tx: TransactionClient,
    ids: { organizationId: string; survivorId: string; loserId: string },
    variantMap: Map<string, string>,
): Promise<void> {
    const { organizationId, survivorId, loserId } = ids;
    const listings = await tx.productListing.findMany({
        where: { productId: loserId },
        include: { variants: { select: { variantId: true } } },
        orderBy: { id: "asc" },
    });
    for (const listing of listings) {
        const there =
            (await tx.productListing.findUnique({
                where: {
                    storeId_productId: {
                        storeId: listing.storeId,
                        productId: survivorId,
                    },
                },
                select: { id: true },
            })) ??
            (await tx.productListing.create({
                data: {
                    organizationId,
                    storeId: listing.storeId,
                    productId: survivorId,
                    createdAt: listing.createdAt,
                },
                select: { id: true },
            }));
        await tx.productListingVariant.createMany({
            data: listing.variants.flatMap((v) => {
                const variantId = variantMap.get(v.variantId);
                return variantId
                    ? [
                          {
                              organizationId,
                              listingId: there.id,
                              productId: survivorId,
                              variantId,
                          },
                      ]
                    : [];
            }),
            skipDuplicates: true,
        });
        await tx.productListing.delete({ where: { id: listing.id } });
    }
}

async function movePhotos(
    tx: TransactionClient,
    survivorId: string,
    loser: { id: string; variants: { id: string; imageId: string | null }[] },
    variantMap: Map<string, string>,
    drop: (what: string, value: unknown) => void,
): Promise<void> {
    const kept = await tx.productImage.findMany({
        where: { productId: survivorId },
        orderBy: { position: "asc" },
    });
    const incoming = await tx.productImage.findMany({
        where: { productId: loser.id },
        orderBy: { position: "asc" },
    });
    // The loser's photo → the survivor's row showing that picture.
    const becomes = new Map<string, string>();
    let photos = kept.filter((i) => i.kind !== "video").length;
    let videos = kept.filter((i) => i.kind === "video").length;
    let position = kept.reduce((n, i) => Math.max(n, i.position + 1), 0);
    for (const image of incoming) {
        const same = kept.find(
            (k) =>
                k.kind === image.kind &&
                ((!!image.mediaId && k.mediaId === image.mediaId) ||
                    k.url === image.url),
        );
        if (same) {
            becomes.set(image.id, same.id);
            continue;
        }
        const video = image.kind === "video";
        if (video ? videos >= VIDEO_LIMIT : photos >= PHOTO_LIMIT) {
            drop(video ? "video" : "photo", image.url);
            continue;
        }
        await tx.productImage.update({
            where: { id: image.id },
            data: { productId: survivorId, position },
        });
        position += 1;
        if (video) videos += 1;
        else photos += 1;
        becomes.set(image.id, image.id);
    }

    // A variant with no photo of its own takes its twin's.
    for (const v of loser.variants) {
        const photo = v.imageId ? becomes.get(v.imageId) : undefined;
        const twin = variantMap.get(v.id);
        if (!photo || !twin) continue;
        await tx.productVariant.updateMany({
            where: { id: twin, imageId: null },
            data: { imageId: photo },
        });
    }
    await tx.productImage.deleteMany({ where: { productId: loser.id } });

    // The cover mirrors the first photo.
    const cover = await tx.productImage.findFirst({
        where: { productId: survivorId, kind: { not: "video" } },
        orderBy: { position: "asc" },
        select: { url: true },
    });
    await tx.product.update({
        where: { id: survivorId },
        data: { image: cover?.url ?? null },
    });
}

async function moveFieldValues(
    tx: TransactionClient,
    survivorId: string,
    loserId: string,
    drop: (what: string, value: unknown) => void,
): Promise<void> {
    const theirs = await tx.productFieldValue.findMany({
        where: { productId: loserId },
        include: { field: { select: { name: true } } },
    });
    const ours = new Map(
        (
            await tx.productFieldValue.findMany({
                where: { productId: survivorId },
                select: { fieldId: true, value: true },
            })
        ).map((v) => [v.fieldId, v.value]),
    );
    for (const value of theirs) {
        const mine = ours.get(value.fieldId);
        if (mine === undefined) {
            await tx.productFieldValue.update({
                where: { id: value.id },
                data: { productId: survivorId },
            });
            continue;
        }
        if (mine !== value.value) drop(value.field.name, value.value);
        await tx.productFieldValue.delete({ where: { id: value.id } });
    }
}

async function moveAllergens(
    tx: TransactionClient,
    survivorId: string,
    loserId: string,
    drop: (what: string, value: unknown) => void,
): Promise<void> {
    const theirs = await tx.productAllergen.findMany({
        where: { productId: loserId },
        include: { allergen: { select: { name: true } } },
    });
    const ours = new Map(
        (
            await tx.productAllergen.findMany({
                where: { productId: survivorId },
                select: { id: true, allergenId: true, kind: true },
            })
        ).map((a) => [a.allergenId, a]),
    );
    for (const row of theirs) {
        const mine = ours.get(row.allergenId);
        if (!mine) {
            await tx.productAllergen.update({
                where: { id: row.id },
                data: { productId: survivorId },
            });
            continue;
        }
        if (mine.kind !== row.kind) {
            // Safety first: what one storefront said it contains, it does.
            if (row.kind === "CONTAINS") {
                await tx.productAllergen.update({
                    where: { id: mine.id },
                    data: { kind: "CONTAINS" },
                });
                drop(`allergen ${row.allergen.name}`, "May contain");
            }
        }
        await tx.productAllergen.delete({ where: { id: row.id } });
    }
}

/** Nothing may still name the product that goes, or its variants. */
async function assertNothingNames(
    tx: TransactionClient,
    productId: string,
    variantIds: string[],
): Promise<void> {
    const variant = { variantId: { in: variantIds } };
    const counts = {
        orderLines: await tx.orderItem.count({
            where: { OR: [{ productId }, variant] },
        }),
        stockLevels: await tx.stockLevel.count({ where: { productId } }),
        listings: await tx.productListing.count({ where: { productId } }),
        listedVariants: await tx.productListingVariant.count({
            where: { OR: [{ productId }, variant] },
        }),
        photos: await tx.productImage.count({ where: { productId } }),
        reviews: await tx.productReview.count({ where: { productId } }),
        discountCodes: await tx.discountProduct.count({ where: { productId } }),
        fieldValues: await tx.productFieldValue.count({ where: { productId } }),
        allergens: await tx.productAllergen.count({ where: { productId } }),
        inventory:
            (await tx.inventory.count({ where: { productId } })) +
            (await tx.variantInventory.count({ where: { productId } })),
    };
    const left = Object.entries(counts).filter(([, n]) => n > 0);
    if (left.length > 0) {
        throw new Error(
            `Merging ${productId} would cascade away ${left
                .map(([what, n]) => `${n} ${what}`)
                .join(", ")}; nothing was changed for its business.`,
        );
    }
}
