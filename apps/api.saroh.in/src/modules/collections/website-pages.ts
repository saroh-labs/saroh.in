import { prisma } from "@saroh/database";

/**
 * "Shown on the website" (#516): the live pages that show a product, read
 * from what each site last published (its current Publication snapshot),
 * never from a draft — a page the merchant hasn't published doesn't show it.
 *
 * A page shows a product when one of its sections is a product block that
 * names the product, or names a collection the product is in. No such block
 * exists yet (the Products/Collection block is #473), so `PRODUCT_BLOCKS` is
 * empty, every answer is `{ showsProducts: false, pages: [] }`, and the
 * screen says "The website doesn't show products yet." When #473 adds a
 * block, it registers how to read its content here.
 */

/** What one section of a product block shows. */
export interface ProductBlockReach {
    productIds: string[];
    collectionIds: string[];
}

/** Reads a product block's published content. Forgiving: unknown → nothing. */
export type ProductBlockReader = (content: unknown) => ProductBlockReach;

/** Section types that show products, by how to read them. None yet (#473). */
export const PRODUCT_BLOCKS: Readonly<Record<string, ProductBlockReader>> = {};

/** A live page that shows the product. */
export interface WebsitePage {
    siteId: string;
    siteName: string;
    path: string;
    title: string;
}

export interface WebsitePlacement {
    /** False until the website has a block that can show products. */
    showsProducts: boolean;
    pages: WebsitePage[];
}

/**
 * The product, and the collections it appears in — or, for a collection's
 * own card on the Products list (#524), no product and just that collection.
 */
export interface ShownTarget {
    productId: string | null;
    collectionIds: readonly string[];
}

/**
 * The pages of one snapshot that show the target. Snapshots are immutable
 * JSON going back to Stage 2, so every level is narrowed; a malformed page or
 * section shows nothing rather than failing the product page.
 */
export function pagesShowing(
    snapshot: unknown,
    target: ShownTarget,
    blocks: Readonly<Record<string, ProductBlockReader>> = PRODUCT_BLOCKS,
): { path: string; title: string }[] {
    if (snapshot === null || typeof snapshot !== "object") return [];
    const pages = (snapshot as { pages?: unknown }).pages;
    if (!Array.isArray(pages)) return [];
    const collections = new Set(target.collectionIds);
    const found: { path: string; title: string }[] = [];
    for (const page of pages) {
        if (page === null || typeof page !== "object") continue;
        const { path, title, sections } = page as {
            path?: unknown;
            title?: unknown;
            sections?: unknown;
        };
        if (typeof path !== "string" || !Array.isArray(sections)) continue;
        const shows = sections.some((section) => {
            if (section === null || typeof section !== "object") return false;
            const { type, content } = section as {
                type?: unknown;
                content?: unknown;
            };
            const read = typeof type === "string" ? blocks[type] : undefined;
            if (!read) return false;
            const reach = read(content);
            return (
                (target.productId !== null &&
                    reach.productIds.includes(target.productId)) ||
                reach.collectionIds.some((id) => collections.has(id))
            );
        });
        if (shows) {
            found.push({
                path,
                title: typeof title === "string" ? title : path,
            });
        }
    }
    return found;
}

/**
 * Every live page, across the business's sites, that shows the target.
 * Skips the read entirely while no block can show a product.
 */
export async function websitePagesFor(
    organizationId: string,
    target: ShownTarget,
    blocks: Readonly<Record<string, ProductBlockReader>> = PRODUCT_BLOCKS,
): Promise<WebsitePlacement> {
    if (Object.keys(blocks).length === 0) {
        return { showsProducts: false, pages: [] };
    }
    const sites = await liveSites(organizationId);
    const pages = sites.flatMap((site) =>
        pagesShowing(site.currentPublication?.snapshot, target, blocks).map(
            (page) => ({ siteId: site.id, siteName: site.name, ...page }),
        ),
    );
    return { showsProducts: true, pages };
}

/**
 * The live pages that show each collection — the Products list's
 * collection cards (#524). One read of the sites for all of them, and none
 * while no block can show a product.
 */
export async function websitePagesForCollections(
    organizationId: string,
    collectionIds: readonly string[],
    blocks: Readonly<Record<string, ProductBlockReader>> = PRODUCT_BLOCKS,
): Promise<Map<string, WebsitePlacement>> {
    const out = new Map<string, WebsitePlacement>();
    if (collectionIds.length === 0) return out;
    if (Object.keys(blocks).length === 0) {
        for (const id of collectionIds) {
            out.set(id, { showsProducts: false, pages: [] });
        }
        return out;
    }
    const sites = await liveSites(organizationId);
    for (const id of collectionIds) {
        const target = { productId: null, collectionIds: [id] };
        out.set(id, {
            showsProducts: true,
            pages: sites.flatMap((site) =>
                pagesShowing(
                    site.currentPublication?.snapshot,
                    target,
                    blocks,
                ).map((page) => ({
                    siteId: site.id,
                    siteName: site.name,
                    ...page,
                })),
            ),
        });
    }
    return out;
}

/** The business's sites that have published, oldest first. */
function liveSites(organizationId: string) {
    return prisma.site.findMany({
        where: {
            organizationId,
            deletedAt: null,
            currentPublicationId: { not: null },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
            id: true,
            name: true,
            currentPublication: { select: { snapshot: true } },
        },
    });
}
