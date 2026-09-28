import { apiFetch, orgBase } from "@/lib/api/http";

/**
 * What a Product grid's panel picks from (G12): the business's products and
 * collections, by name. Server-only; the editor reaches it through
 * `listGridCatalogue` in `actions.ts`.
 *
 * A failed read is said, never shown as "no products yet", so a picker
 * never calls a chosen product deleted because the read failed. A person
 * the API won't show the catalogue to is told so (`forbidden`).
 */

/** A product the grid can pick, with whether it can show at all. */
export interface GridProductOption {
    id: string;
    name: string;
    /** DRAFT, PUBLISHED or ARCHIVED: only a published one ever shows. */
    status: string;
}

export interface GridCollectionOption {
    id: string;
    name: string;
    /** Products it shows now (archived ones never count). */
    productCount: number;
}

export type GridCatalogueRead =
    | {
          ok: true;
          products: GridProductOption[];
          collections: GridCollectionOption[];
      }
    | { ok: false; forbidden: boolean };

export async function readGridCatalogue(): Promise<GridCatalogueRead> {
    const base = await orgBase();
    if (!base) return { ok: false, forbidden: false };
    try {
        const [products, collections] = await Promise.all([
            apiFetch(`${base}/products`),
            apiFetch(`${base}/collections`),
        ]);
        if (products.status === 403 || collections.status === 403) {
            return { ok: false, forbidden: true };
        }
        if (!products.ok || !collections.ok) {
            return { ok: false, forbidden: false };
        }
        const rows = (await products.json()) as GridProductOption[];
        const groups = (await collections.json()) as GridCollectionOption[];
        const byName = (a: { name: string }, b: { name: string }) =>
            a.name.localeCompare(b.name);
        return {
            ok: true,
            // One row per product: the list read repeats none, but a picker
            // must never offer the same product twice.
            products: Array.from(
                new Map(
                    rows.map((p) => [
                        p.id,
                        { id: p.id, name: p.name, status: p.status },
                    ]),
                ).values(),
            ).sort(byName),
            collections: groups
                .map((c) => ({
                    id: c.id,
                    name: c.name,
                    productCount: c.productCount,
                }))
                .sort(byName),
        };
    } catch {
        return { ok: false, forbidden: false };
    }
}
