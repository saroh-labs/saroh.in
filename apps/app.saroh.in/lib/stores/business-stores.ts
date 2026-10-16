import type { StorefrontKind, StorefrontSummary } from "./storefronts";

/**
 * The active business's locations, as every screen that asks "which
 * location?" lists them. Pure: the read is `listBusinessStores()` in
 * `service.ts`.
 *
 * `kind` and `productCount` are null when they weren't read — a person
 * whose role can't read the business's locations sees only the ones they
 * were invited to, from a read that doesn't carry them.
 */
export interface BusinessStore {
    id: string;
    name: string;
    kind: StorefrontKind | null;
    productCount: number | null;
}

/** The business's storefronts list, as the locations a chooser offers. */
export function fromStorefronts(
    storefronts: readonly Pick<
        StorefrontSummary,
        "id" | "name" | "kind" | "productCount"
    >[],
): BusinessStore[] {
    return storefronts.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        // Absent from an API that predates it: not said, rather than 0.
        productCount:
            typeof s.productCount === "number" ? s.productCount : null,
    }));
}

/**
 * The locations someone is on (`GET /stores`), kept to the active
 * business: that read spans every business they work in. A store without
 * its business id is left out rather than guessed into this one. That read
 * is newest first; this is oldest first, as the storefronts list is.
 */
export function ownInBusiness(
    stores: readonly { id: string; name: string; organizationId?: string }[],
    organizationId: string,
): BusinessStore[] {
    return stores
        .filter((s) => s.organizationId === organizationId)
        .reverse()
        .map((s) => ({
            id: s.id,
            name: s.name,
            kind: null,
            productCount: null,
        }));
}

/** "No counter" / "Customers visit", as lists elsewhere name the kinds. */
const KIND_WORDS: Record<StorefrontKind, string> = {
    SHOP: "Customers visit",
    ONLINE: "No counter",
};

/**
 * What a location is, under its name in a chooser: "No counter · 12
 * products". Null when nothing about it was read.
 */
export function locationLine(store: {
    kind?: StorefrontKind | null;
    productCount?: number | null;
}): string | null {
    const parts = [
        store.kind ? KIND_WORDS[store.kind] : null,
        typeof store.productCount === "number"
            ? store.productCount === 1
                ? "1 product"
                : `${store.productCount} products`
            : null,
    ].filter((p): p is string => p !== null);
    return parts.length ? parts.join(" · ") : null;
}

/**
 * May add a location (`store:create`): the chooser's empty list offers
 * New location only then. The role's name decides only for an API that
 * predates permissions.
 */
export function canAddLocation(
    organization:
        | { actions?: readonly string[] | null; role?: string | null }
        | null
        | undefined,
): boolean {
    return organization?.actions
        ? organization.actions.includes("store:create")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
}

/**
 * Import's line above "which location?" (16 Oct audit): what choosing one
 * means for the others. Null with fewer than two, when nothing is asked.
 */
export function importChooserLead(count: number): string | null {
    if (count < 2) return null;
    const others = count === 2 ? "your other location" : "your other locations";
    return `They'll be sold here. You can add them to ${others} from each product.`;
}
