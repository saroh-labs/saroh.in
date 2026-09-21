import type { CrmResult } from "@/lib/api/http";
import { destroy, getJson, mutate, orgBase } from "@/lib/api/http";

/**
 * Sell → Storefronts: every storefront in the business and the settings that
 * belong to one storefront rather than to the business.
 *
 * Read through the org-scoped `/storefronts` routes, not `/stores/:id`: those
 * are the storefront's own screens, still on the legacy owner/member path,
 * and this screen should be decided by the viewer's permissions alone.
 *
 * Server-only: `orgBase` reads the active-organization cookie.
 */

export type StorefrontKind = "SHOP" | "ONLINE";

export interface StorefrontSummary {
    id: string;
    name: string;
    orderCount: number;
    kind: StorefrontKind;
    paused: boolean;
}

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

/** One day of a shop's week; times are "HH:MM", local to the shop. */
export interface OpeningHoursDay {
    day: Weekday;
    open: string;
    close: string;
    closed: boolean;
}

export interface StorefrontProvider {
    provider: string;
    status: string;
}

export interface StorefrontSettings extends StorefrontSummary {
    currency: string;
    /** Fixed once the storefront has taken an order. */
    currencyLocked: boolean;
    taxEnabled: boolean;
    /** A percentage as a string, "18.00". */
    taxRate: string;
    shippingEnabled: boolean;
    /** Money as a string; `null` when delivery is never free. */
    freeShippingThreshold: string | null;
    /** Orders still waiting to go out — closing is refused while any are. */
    unfulfilled: number;
    address: string | null;
    openingHours: OpeningHoursDay[] | null;
    collectionEnabled: boolean;
    tipsEnabled: boolean;
    guestCheckout: boolean;
    pausedAt: string | null;
    checkoutProvider: string | null;
    /** What checkout will really charge through; `null` means it cannot. */
    effectiveProvider: string | null;
    providers: StorefrontProvider[];
}

export type StorefrontInput = Partial<
    Pick<
        StorefrontSettings,
        | "name"
        | "currency"
        | "taxEnabled"
        | "taxRate"
        | "shippingEnabled"
        | "freeShippingThreshold"
        | "kind"
        | "address"
        | "openingHours"
        | "collectionEnabled"
        | "tipsEnabled"
        | "guestCheckout"
        | "checkoutProvider"
    > & { paused: boolean }
>;

export async function listStorefronts(): Promise<StorefrontSummary[]> {
    const base = await orgBase();
    if (!base) return [];
    return (await getJson<StorefrontSummary[]>(`${base}/storefronts`)) ?? [];
}

export async function getStorefront(
    storeId: string,
): Promise<StorefrontSettings | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<StorefrontSettings>(
        `${base}/storefronts/${encodeURIComponent(storeId)}`,
    );
}

export async function updateStorefront(
    storeId: string,
    input: StorefrontInput,
): Promise<CrmResult<StorefrontSettings>> {
    return mutate<StorefrontSettings>(
        `/storefronts/${encodeURIComponent(storeId)}`,
        "PATCH",
        input,
        "Could not save that.",
    );
}

export async function closeStorefront(
    storeId: string,
): Promise<CrmResult<object>> {
    return destroy(
        `/storefronts/${encodeURIComponent(storeId)}`,
        "Could not close that storefront.",
    );
}
