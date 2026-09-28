import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { collectionOnSale } from "../products/grid-collection";
import type { Flag } from "./site-flags";

/**
 * The Product grid's two checks in the editor (round-2 G12).
 *
 * - **At save**, a grid may name only this business's collection and
 *   products. An id from another business is refused with a 400 naming the
 *   section. An id the stored draft already named is carried through even
 *   if it has since gone (deleted), so one deletion never blocks every later
 *   save of the page; the flag below says it has gone.
 * - **Before publish** (the flag engine, advisory), a grid that will show
 *   nothing live, or less than was picked, says so: nothing chosen yet, a
 *   collection deleted or empty here, picked products no longer on sale.
 */

/** A Product grid's content, read forgivingly: JSON from a draft row. */
interface GridContent {
    source: "newest" | "collection" | "picked";
    collectionId: string | null;
    productIds: string[];
}

export function gridContent(content: unknown): GridContent {
    const c = (
        typeof content === "object" && content !== null ? content : {}
    ) as { source?: unknown; collectionId?: unknown; productIds?: unknown };
    const source =
        c.source === "collection" || c.source === "picked"
            ? c.source
            : "newest";
    return {
        source,
        collectionId:
            typeof c.collectionId === "string" && c.collectionId !== ""
                ? c.collectionId
                : null,
        productIds: Array.isArray(c.productIds)
            ? c.productIds.filter((id): id is string => typeof id === "string")
            : [],
    };
}

/** Every id a grid names, whichever source it is on now. */
function namedIds(content: unknown): {
    collectionIds: string[];
    productIds: string[];
} {
    const c = gridContent(content);
    return {
        collectionIds: c.collectionId ? [c.collectionId] : [],
        productIds: c.productIds,
    };
}

/** One section of a save, with the stored one it replaces (same key). */
export interface GridSave {
    index: number;
    content: unknown;
    /** The stored section under the same key, if it was a grid. */
    stored: unknown;
}

/**
 * The first grid naming an id that is not the business's and that its
 * stored self did not already name, or null. Pure: `known` holds the ids
 * found in the business.
 */
export function foreignGridRef(
    saves: readonly GridSave[],
    known: {
        collectionIds: ReadonlySet<string>;
        productIds: ReadonlySet<string>;
    },
): { index: number; field: "collectionId" | "productIds" } | null {
    for (const save of saves) {
        const now = namedIds(save.content);
        const before = namedIds(save.stored);
        if (
            now.collectionIds.some(
                (id) =>
                    !known.collectionIds.has(id) &&
                    !before.collectionIds.includes(id),
            )
        ) {
            return { index: save.index, field: "collectionId" };
        }
        if (
            now.productIds.some(
                (id) =>
                    !known.productIds.has(id) &&
                    !before.productIds.includes(id),
            )
        ) {
            return { index: save.index, field: "productIds" };
        }
    }
    return null;
}

/**
 * Refuse a save whose grid names another business's collection or product.
 * `storedByKey` is read only when some id isn't found in the business.
 */
export async function assertGridRefsOwned(
    organizationId: string,
    sections: readonly { type: string; content: unknown; key?: string }[],
    storedByKey: () => Promise<Map<string, { type: string; content: unknown }>>,
): Promise<void> {
    const grids = sections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => section.type === "productGrid");
    if (grids.length === 0) return;
    const collectionIds = new Set<string>();
    const productIds = new Set<string>();
    for (const { section } of grids) {
        const ids = namedIds(section.content);
        ids.collectionIds.forEach((id) => collectionIds.add(id));
        ids.productIds.forEach((id) => productIds.add(id));
    }
    if (collectionIds.size === 0 && productIds.size === 0) return;

    const [collections, products] = await Promise.all([
        collectionIds.size === 0
            ? []
            : prisma.collection.findMany({
                  where: { organizationId, id: { in: [...collectionIds] } },
                  select: { id: true },
              }),
        productIds.size === 0
            ? []
            : prisma.product.findMany({
                  where: { organizationId, id: { in: [...productIds] } },
                  select: { id: true },
              }),
    ]);
    const known = {
        collectionIds: new Set(collections.map((c) => c.id)),
        productIds: new Set(products.map((p) => p.id)),
    };
    const allKnown =
        [...collectionIds].every((id) => known.collectionIds.has(id)) &&
        [...productIds].every((id) => known.productIds.has(id));
    if (allKnown) return;

    const stored = await storedByKey();
    const foreign = foreignGridRef(
        grids.map(({ section, index }) => {
            const before = section.key ? stored.get(section.key) : undefined;
            return {
                index,
                content: section.content,
                stored: before?.type === "productGrid" ? before.content : null,
            };
        }),
        known,
    );
    if (!foreign) return;
    throw new BadRequestException({
        message:
            foreign.field === "collectionId"
                ? `Section at index ${foreign.index} names a collection that isn't one of yours.`
                : `Section at index ${foreign.index} names a product that isn't one of yours.`,
        details: {
            index: foreign.index,
            field: foreign.field,
            section: { type: "productGrid", contractVersion: 1 },
        },
    });
}

// ---------------------------------------------------------------------------
// Before publish
// ---------------------------------------------------------------------------

/** One page's sections, as the flag engine reads them. */
export interface GridFlagPage {
    id: string;
    hidden: boolean;
    sections: { type: string; content: unknown; hidden: boolean }[];
}

/** What is sold at the site's storefront, for the grids that name ids. */
export interface GridStock {
    storefrontName: string;
    /** Published products listed at the storefront, among those named. */
    onSale: ReadonlySet<string>;
    /** Named collections of the business, with what of each is on sale. */
    collections: ReadonlyMap<string, { name: string; onSale: number }>;
}

/**
 * The grids' pre-publish flags. Pure. Only visible grids on visible pages
 * are checked: a hidden one shows nothing anyway.
 */
export function checkProductGrids(
    pages: readonly GridFlagPage[],
    stock: GridStock,
): Flag[] {
    const flags: Flag[] = [];
    const where = stock.storefrontName;
    for (const page of pages) {
        if (page.hidden) continue;
        page.sections.forEach((section, index) => {
            if (section.type !== "productGrid" || section.hidden) return;
            const at = (
                type: Flag["type"],
                message: string,
                field: string | null,
            ) =>
                flags.push({
                    type,
                    message,
                    pageId: page.id,
                    sectionIndex: index,
                    field,
                });
            const c = gridContent(section.content);
            if (c.source === "collection") {
                if (!c.collectionId) {
                    at(
                        "emptyRequiredField",
                        "Choose which collection this product grid shows. Until you do, it doesn't show on your site.",
                        "collectionId",
                    );
                    return;
                }
                const collection = stock.collections.get(c.collectionId);
                if (!collection) {
                    at(
                        "productsNotOnSale",
                        "The collection this product grid showed has been deleted, so the grid doesn't show on your site. Choose another.",
                        "collectionId",
                    );
                } else if (collection.onSale === 0) {
                    at(
                        "productsNotOnSale",
                        `Nothing in ${collection.name} is on sale at ${where}, so this product grid doesn't show on your site.`,
                        "collectionId",
                    );
                }
                return;
            }
            if (c.source === "picked") {
                if (c.productIds.length === 0) {
                    at(
                        "emptyRequiredField",
                        "Pick the products this grid shows. Until you do, it doesn't show on your site.",
                        "productIds",
                    );
                    return;
                }
                const gone = c.productIds.filter(
                    (id) => !stock.onSale.has(id),
                ).length;
                if (gone === c.productIds.length) {
                    at(
                        "productsNotOnSale",
                        `None of the products picked here is on sale at ${where} any more, so this product grid doesn't show on your site. Pick others, or show your newest.`,
                        "productIds",
                    );
                } else if (gone > 0) {
                    at(
                        "productsNotOnSale",
                        gone === 1
                            ? `1 product picked here isn't on sale at ${where} any more, so it doesn't show.`
                            : `${gone} products picked here aren't on sale at ${where} any more, so they don't show.`,
                        "productIds",
                    );
                }
            }
        });
    }
    return flags;
}

/**
 * Load what the grids on these pages name, at the storefront, and check
 * them. Runs only while the shop is open and a storefront is chosen; the
 * caller's own flag covers a storefront not chosen yet.
 */
export async function productGridFlags(
    organizationId: string,
    storefront: { id: string; name: string },
    pages: readonly GridFlagPage[],
): Promise<Flag[]> {
    const grids = pages
        .filter((p) => !p.hidden)
        .flatMap((p) =>
            p.sections.filter((s) => s.type === "productGrid" && !s.hidden),
        )
        .map((s) => gridContent(s.content));
    if (grids.length === 0) return [];
    const productIds = [
        ...new Set(
            grids
                .filter((g) => g.source === "picked")
                .flatMap((g) => g.productIds),
        ),
    ];
    const collectionIds = [
        ...new Set(
            grids
                .filter((g) => g.source === "collection")
                .flatMap((g) => (g.collectionId ? [g.collectionId] : [])),
        ),
    ];
    const [onSale, collections] = await Promise.all([
        productIds.length === 0
            ? []
            : prisma.product.findMany({
                  where: {
                      organizationId,
                      id: { in: productIds },
                      status: "PUBLISHED",
                      listings: { some: { storeId: storefront.id } },
                  },
                  select: { id: true },
              }),
        Promise.all(
            collectionIds.map(
                async (id) =>
                    [
                        id,
                        await collectionOnSale(
                            organizationId,
                            id,
                            storefront.id,
                        ),
                    ] as const,
            ),
        ),
    ]);
    const known = new Map<string, { name: string; onSale: number }>();
    for (const [id, found] of collections) {
        if (found) {
            known.set(id, {
                name: found.name,
                onSale: found.productIds.length,
            });
        }
    }
    return checkProductGrids(pages, {
        storefrontName: storefront.name,
        onSale: new Set(onSale.map((p) => p.id)),
        collections: known,
    });
}
