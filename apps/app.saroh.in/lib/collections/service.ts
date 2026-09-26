import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import { apiFetch, getJson, getList, orgBase } from "@/lib/api/http";
import type { ProductPlacement } from "@/lib/products/overview-rules";

/**
 * The business's collections (#516, #524): `organizations/:org/collections`
 * and a product's own `…/products/:id/collections`. Reading needs
 * `store:read`; making, changing, filling and deleting one needs
 * `store:write` — the API decides, and says why when it refuses (the 500
 * cap, an automatic one picked by hand, a name already taken). Server-only.
 *
 * A collection is hand-picked (its products kept, in order) or automatic by
 * category — everything in that category and the ones inside it — never
 * both, and never changed from one to the other.
 */

export type CollectionKind = "HAND_PICKED" | "AUTOMATIC";

/** The live website pages that show a collection or a product. */
export type WebsitePlacement = ProductPlacement["website"];

export interface CollectionSummary {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    kind: CollectionKind;
    /** The category an automatic collection fills itself from. */
    category: { id: string; name: string } | null;
    /** Products it shows now; archived ones never count. */
    productCount: number;
    /** Optional so an older API's answer still reads. */
    website?: WebsitePlacement;
    createdAt: string;
    updatedAt: string;
}

export interface CollectionProduct {
    id: string;
    name: string;
    slug: string;
    image: string | null;
    status: string;
    price: string;
    categoryId: string | null;
}

export interface CollectionDetail extends CollectionSummary {
    /** In order: as picked, or (automatic) by name. */
    products: CollectionProduct[];
    /** Hand-picked products it keeps while they are archived, not shown. */
    hiddenCount: number;
}

export interface CollectionInput {
    name: string;
    description?: string | null;
    /** Automatic: the category it fills itself from. */
    categoryId?: string;
    /** Hand-picked, on create: its first products, in order. */
    productIds?: string[];
}

export type CollectionResult<T> = ApiResult<T>;

const NO_BUSINESS = "Pick a business first, then try again.";

async function collectionsPath(collectionId?: string): Promise<string | null> {
    const base = await orgBase();
    if (!base) return null;
    return collectionId
        ? `${base}/collections/${encodeURIComponent(collectionId)}`
        : `${base}/collections`;
}

async function send<T>(
    path: string | null,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
): Promise<ApiResult<T>> {
    if (!path) return { ok: false, error: NO_BUSINESS };
    const res = await apiFetch(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: (data ?? {}) as T };
    return toFailure(data, "The collection couldn't be saved. Try again.");
}

// ---- Reads ----

/**
 * Every collection, by name. Throws when it can't be read — a failed read
 * is never "no collections yet". Empty with no business active.
 */
export async function listCollections(): Promise<CollectionSummary[]> {
    const path = await collectionsPath();
    if (!path) return [];
    return getList<CollectionSummary>(path);
}

/** One collection with its products; null when it isn't this business's. */
export async function getCollection(
    collectionId: string,
): Promise<CollectionDetail | null> {
    const path = await collectionsPath(collectionId);
    if (!path) return null;
    return getJson<CollectionDetail>(path);
}

/** A product's collections and the live pages that show it. */
export async function getProductCollections(
    productId: string,
): Promise<ProductPlacement | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<ProductPlacement>(
        `${base}/products/${encodeURIComponent(productId)}/collections`,
    );
}

// ---- Writes ----

export async function createCollection(input: CollectionInput) {
    return send<CollectionDetail>(await collectionsPath(), "POST", input);
}

/** Rename, describe, or (automatic only) point at another category. */
export async function updateCollection(
    collectionId: string,
    input: Partial<Omit<CollectionInput, "productIds">>,
) {
    return send<CollectionDetail>(
        await collectionsPath(collectionId),
        "PATCH",
        input,
    );
}

/** Delete it; its products stay as they are. */
export async function deleteCollection(collectionId: string) {
    return send<{ id: string }>(await collectionsPath(collectionId), "DELETE");
}

/** A hand-picked collection's whole list, in order. */
export async function setCollectionProducts(
    collectionId: string,
    productIds: string[],
) {
    const path = await collectionsPath(collectionId);
    return send<CollectionDetail>(path && `${path}/products`, "PUT", {
        productIds,
    });
}

/** Put a product in exactly these hand-picked collections. */
export async function setProductCollections(
    productId: string,
    collectionIds: string[],
) {
    const base = await orgBase();
    return send<ProductPlacement>(
        base && `${base}/products/${encodeURIComponent(productId)}/collections`,
        "PUT",
        { collectionIds },
    );
}
