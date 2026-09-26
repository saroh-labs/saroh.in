"use server";

import type { ApiResult } from "@/lib/api/failure";
import { listCataloguePage } from "@/lib/products/service";

import type { CollectionDetail, CollectionInput } from "./service";
import {
    createCollection,
    deleteCollection,
    getCollection,
    setCollectionProducts,
    setProductCollections,
    updateCollection,
} from "./service";

/**
 * Server Actions for the collections screens (#524). Thin wrappers over
 * `service.ts`; the API decides who may (`store:write`) and says why it
 * refuses. A refusal that names a field keeps it, so the sheet can put it
 * there.
 */

/** A product the sheet can pick, as the catalogue search finds it. */
export interface PickableProduct {
    id: string;
    name: string;
    image: string | null;
    status: string;
}

/** One collection with its products, for the sheet to open on. */
export async function loadCollection(
    collectionId: string,
): Promise<ApiResult<CollectionDetail>> {
    try {
        const found = await getCollection(collectionId);
        return found
            ? { ok: true, data: found }
            : { ok: false, error: "That collection has been deleted." };
    } catch {
        return {
            ok: false,
            error: "The collection couldn't be read just now. Try again.",
        };
    }
}

/**
 * The catalogue's products matching `q` (names and SKUs, as the list's
 * search), for picking by hand. Twenty at a time; the search narrows.
 */
export async function findProducts(
    q: string,
): Promise<ApiResult<{ items: PickableProduct[]; more: boolean }>> {
    try {
        const page = await listCataloguePage({
            q: q.trim() || undefined,
            limit: 20,
        });
        if (!page) return { ok: false, error: "Pick a business first." };
        return {
            ok: true,
            data: {
                items: page.items.map((p) => ({
                    id: p.id,
                    name: p.name,
                    image: p.image,
                    status: p.status,
                })),
                more: page.nextCursor !== null,
            },
        };
    } catch {
        return {
            ok: false,
            error: "Products couldn't be searched just now. Try again.",
        };
    }
}

export async function saveNewCollection(input: CollectionInput) {
    return createCollection(input);
}

/**
 * Save an edit: its name, description or category first, then (hand-picked)
 * its whole list. When the list is refused after the rest saved, it says so.
 */
export async function saveCollection(
    collectionId: string,
    patch: { name?: string; description?: string | null; categoryId?: string },
    products: string[] | null,
): Promise<ApiResult<CollectionDetail | null> & { partly?: boolean }> {
    let saved: CollectionDetail | null = null;
    if (Object.keys(patch).length > 0) {
        const res = await updateCollection(collectionId, patch);
        if (!res.ok) return res;
        saved = res.data;
    }
    if (products) {
        const res = await setCollectionProducts(collectionId, products);
        if (!res.ok) return { ...res, partly: saved !== null };
        saved = res.data;
    }
    return { ok: true, data: saved };
}

export async function removeCollection(collectionId: string) {
    return deleteCollection(collectionId);
}

/** Put a product in exactly these hand-picked collections. */
export async function saveProductCollections(
    productId: string,
    collectionIds: string[],
) {
    return setProductCollections(productId, collectionIds);
}
