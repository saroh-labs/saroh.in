import { prisma } from "@saroh/database";

import { categoryTree } from "../collections/collections.service";

/** The most products one collection gives a grid, or a flag, to look at. */
const MAX_MEMBERS = 200;

/**
 * A collection's products sold at a storefront, in the collection's order
 * (DEC-031): hand-picked as placed, automatic by name from its category and
 * the ones inside it. Only published products listed at `storefrontId`.
 *
 * Null when the collection isn't this business's (another business's, or
 * deleted): the Product grid shows nothing, and the editor's flag says the
 * collection has gone. Shared by the grid's read (G12) and its pre-publish
 * flag, so the two never disagree about what the grid holds.
 *
 * Callers run it in the business's RLS context.
 */
export async function collectionOnSale(
    organizationId: string,
    collectionId: string,
    storefrontId: string,
): Promise<{ name: string; productIds: string[] } | null> {
    const collection = await prisma.collection.findFirst({
        where: { id: collectionId, organizationId },
        select: { id: true, name: true, categoryId: true },
    });
    if (!collection) return null;
    const onSale = {
        organizationId,
        status: "PUBLISHED",
        listings: { some: { storeId: storefrontId } },
    };
    if (collection.categoryId) {
        const tree = await categoryTree(organizationId);
        const rows = await prisma.product.findMany({
            where: {
                ...onSale,
                categoryId: { in: tree.within(collection.categoryId) },
            },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            take: MAX_MEMBERS,
            select: { id: true },
        });
        return { name: collection.name, productIds: rows.map((r) => r.id) };
    }
    const members = await prisma.collectionProduct.findMany({
        where: {
            collectionId: collection.id,
            organizationId,
            product: onSale,
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        take: MAX_MEMBERS,
        select: { productId: true },
    });
    return {
        name: collection.name,
        productIds: members.map((m) => m.productId),
    };
}
