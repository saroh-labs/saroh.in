import type { ProductPlacement } from "@/lib/products/overview-rules";
import { plural } from "@/lib/products/overview-rules";

import type {
    CollectionKind,
    CollectionSummary,
    WebsitePlacement,
} from "./service";

/**
 * The words and rules the collections screens share (#524): the Products
 * list's cards, the collection sheet, and the product page's tab and its
 * sheet. Pure, so they are tested without a screen. The API stays the
 * authority on every limit here; these say it before a save is tried.
 */

/** The most products a hand-picked collection holds (the API's cap). */
export const COLLECTION_PRODUCTS_MAX = 500;
/** The longest name — a card title and a chip. */
export const COLLECTION_NAME_MAX = 60;
export const COLLECTION_DESCRIPTION_MAX = 600;

/** "4 products · picked by hand"; "12 products · fills itself: everything in Breads". */
export function collectionNote(c: {
    kind: CollectionKind;
    productCount: number;
    category: { name: string } | null;
}): string {
    const count = plural(c.productCount, "product");
    return c.kind === "AUTOMATIC"
        ? `${count} · fills itself: everything in ${c.category?.name ?? "its category"}`
        : `${count} · picked by hand`;
}

/**
 * Where the website shows a collection, in one line — or null when the
 * API didn't say (an older answer), so nothing is claimed.
 */
export function websiteLine(
    website: WebsitePlacement | undefined,
): string | null {
    if (!website) return null;
    if (!website.showsProducts) return "The website doesn't show products yet.";
    if (website.pages.length === 0) return "No live page shows it.";
    return `Shown on ${website.pages.map((p) => p.title || p.path).join(", ")}`;
}

/**
 * Whether every card would say the same website line — then the list says
 * it once, under the cards, rather than on each.
 */
export function oneWebsiteLine(
    collections: readonly Pick<CollectionSummary, "website">[],
): string | null {
    if (collections.length === 0) return null;
    return collections.every((c) => c.website && !c.website.showsProducts)
        ? "The website doesn't show products yet, so no page shows these collections."
        : null;
}

// ---- Categories ----

export interface CategoryNode {
    id: string;
    name: string;
    parentId: string | null;
}

/** "Breads › Sourdough": a category with the ones above it. */
export function categoryPath(
    categories: readonly CategoryNode[],
    id: string,
): string {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const names: string[] = [];
    const seen = new Set<string>();
    let at = byId.get(id);
    while (at && !seen.has(at.id)) {
        seen.add(at.id);
        names.unshift(at.name);
        at = at.parentId ? byId.get(at.parentId) : undefined;
    }
    return names.join(" › ");
}

/** Every category as a choice, by its path, so children sit under parents. */
export function categoryChoices(
    categories: readonly CategoryNode[],
): { value: string; label: string }[] {
    return categories
        .map((c) => ({ value: c.id, label: categoryPath(categories, c.id) }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** How many categories sit inside `id`, however deep. */
export function childCount(
    categories: readonly CategoryNode[],
    id: string,
): number {
    let n = 0;
    const queue = [id];
    const seen = new Set<string>();
    while (queue.length > 0) {
        const next = queue.shift();
        if (next === undefined || seen.has(next)) continue;
        seen.add(next);
        for (const c of categories) {
            if (c.parentId === next) {
                n += 1;
                queue.push(c.id);
            }
        }
    }
    return n;
}

/** What an automatic rule reaches, said under the category picker. */
export function ruleNote(
    categories: readonly CategoryNode[],
    categoryId: string,
): string {
    const name = categories.find((c) => c.id === categoryId)?.name;
    if (!name) return "Pick the category it fills itself from.";
    const inside = childCount(categories, categoryId);
    return inside > 0
        ? `Everything in ${name} and the ${plural(inside, "category", "categories")} inside it. Products join and leave as their category changes.`
        : `Everything in ${name}. Products join and leave as their category changes.`;
}

/**
 * Why a product is in an automatic collection: its own category, or one
 * inside the collection's — "it's in Sourdough, inside Breads".
 */
export function whyIn(
    collection: {
        kind: CollectionKind;
        category: { id: string; name: string } | null;
    },
    productCategoryId: string | null,
    categories: readonly CategoryNode[],
): string | null {
    if (collection.kind !== "AUTOMATIC" || !collection.category) return null;
    if (!productCategoryId || productCategoryId === collection.category.id) {
        return `It's in ${collection.category.name}.`;
    }
    const own = categories.find((c) => c.id === productCategoryId)?.name;
    return own
        ? `It's in ${own}, inside ${collection.category.name}.`
        : `Its category is inside ${collection.category.name}.`;
}

// ---- Hand-picked products ----

/** How full a hand-picked list is, and what adding more would do. */
export function capacity(count: number): {
    left: number;
    full: boolean;
    words: string;
} {
    const left = Math.max(0, COLLECTION_PRODUCTS_MAX - count);
    return {
        left,
        full: left === 0,
        words:
            left === 0
                ? `Full — a collection holds up to ${COLLECTION_PRODUCTS_MAX} products.`
                : `${count} of ${COLLECTION_PRODUCTS_MAX}`,
    };
}

/** Pick or unpick one product; picking past the cap does nothing. */
export function togglePicked(list: readonly string[], id: string): string[] {
    if (list.includes(id)) return list.filter((x) => x !== id);
    if (list.length >= COLLECTION_PRODUCTS_MAX) return [...list];
    return [...list, id];
}

/** Move one picked product up (-1) or down (+1); the ends stay put. */
export function movePicked(
    list: readonly string[],
    id: string,
    by: -1 | 1,
): string[] {
    const i = list.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return [...list];
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
}

export function sameList(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((x, i) => x === b[i]);
}

// ---- The sheet ----

export interface SheetValues {
    name: string;
    description: string;
    kind: CollectionKind;
    categoryId: string;
    productIds: string[];
}

/** The first thing stopping a save, said as the field would say it. */
export function sheetProblem(v: SheetValues): {
    field: "name" | "description" | "categoryId" | "productIds";
    message: string;
} | null {
    const name = v.name.trim();
    if (!name) return { field: "name", message: "A collection needs a name." };
    if (name.length > COLLECTION_NAME_MAX) {
        return {
            field: "name",
            message: `Keep it under ${COLLECTION_NAME_MAX} characters.`,
        };
    }
    if (!/[a-z0-9]/i.test(name)) {
        return {
            field: "name",
            message: "Use a few letters or numbers in the name.",
        };
    }
    if (v.description.trim().length > COLLECTION_DESCRIPTION_MAX) {
        return {
            field: "description",
            message: `Keep it under ${COLLECTION_DESCRIPTION_MAX} characters.`,
        };
    }
    if (v.kind === "AUTOMATIC" && !v.categoryId) {
        return {
            field: "categoryId",
            message: "Pick the category it fills itself from.",
        };
    }
    if (
        v.kind === "HAND_PICKED" &&
        v.productIds.length > COLLECTION_PRODUCTS_MAX
    ) {
        return {
            field: "productIds",
            message: `A collection holds up to ${COLLECTION_PRODUCTS_MAX} products.`,
        };
    }
    return null;
}

/** A new collection's body: a category or products, never both. */
export function createBody(v: SheetValues) {
    const description = v.description.trim();
    return {
        name: v.name.trim(),
        ...(description ? { description } : {}),
        ...(v.kind === "AUTOMATIC"
            ? { categoryId: v.categoryId }
            : { productIds: v.productIds }),
    };
}

/**
 * What an edit sends: the fields that changed, and whether the picked list
 * did (it is saved on its own, whole and in order).
 */
export function editChanges(
    before: SheetValues,
    after: SheetValues,
): {
    patch: { name?: string; description?: string | null; categoryId?: string };
    products: string[] | null;
} {
    const patch: {
        name?: string;
        description?: string | null;
        categoryId?: string;
    } = {};
    if (after.name.trim() !== before.name.trim())
        patch.name = after.name.trim();
    if (after.description.trim() !== before.description.trim()) {
        patch.description = after.description.trim() || null;
    }
    if (after.kind === "AUTOMATIC" && after.categoryId !== before.categoryId) {
        patch.categoryId = after.categoryId;
    }
    const products =
        after.kind === "HAND_PICKED" &&
        !sameList(before.productIds, after.productIds)
            ? after.productIds
            : null;
    return { patch, products };
}

// ---- The product page ----

export interface MembershipRow {
    id: string;
    name: string;
    on: boolean;
    /** Automatic: it follows the category, so it can't be ticked here. */
    locked: boolean;
    note: string;
}

/**
 * The product page's "Edit collections" rows: every collection, ticked
 * where the product is in it. An automatic one is locked and says why; a
 * full hand-picked one can't take it.
 */
export function membershipRows(
    all: readonly CollectionSummary[],
    placement: ProductPlacement,
): MembershipRow[] {
    const inIt = new Set(placement.collections.map((c) => c.id));
    return all.map((c) => {
        const on = inIt.has(c.id);
        if (c.kind === "AUTOMATIC") {
            return {
                id: c.id,
                name: c.name,
                on,
                locked: true,
                note: `Fills itself from the category ${c.category?.name ?? ""} — change the product's category to change this.`,
            };
        }
        const full = !on && c.productCount >= COLLECTION_PRODUCTS_MAX;
        return {
            id: c.id,
            name: c.name,
            on,
            locked: full,
            note: full
                ? `Full — it holds ${COLLECTION_PRODUCTS_MAX} products, the most a collection can.`
                : collectionNote(c),
        };
    });
}

/** The hand-picked ones ticked: what the product page's sheet saves. */
export function pickedIds(
    rows: readonly MembershipRow[],
    all: readonly CollectionSummary[],
): string[] {
    const handPicked = new Set(
        all.filter((c) => c.kind === "HAND_PICKED").map((c) => c.id),
    );
    return rows.filter((r) => r.on && handPicked.has(r.id)).map((r) => r.id);
}
