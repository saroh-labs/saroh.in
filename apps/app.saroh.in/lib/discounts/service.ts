import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";

/**
 * Discount codes — owned by the business, so read and written through the
 * org-nested `/organizations/:id/discounts` routes (the forms shape, not the
 * store-scoped products one). Server-only: `orgBase` reads the active
 * organization.
 */

export type DiscountKind = "PERCENTAGE" | "FIXED_AMOUNT";
export type DiscountReach =
    "BUSINESS" | "STOREFRONT" | "COLLECTION" | "PRODUCT";
/** Computed by the API; Exhausted is drawn like Expired. */
export type DiscountState = "SCHEDULED" | "ACTIVE" | "EXPIRED" | "EXHAUSTED";

export interface Discount {
    id: string;
    code: string;
    description: string | null;
    kind: DiscountKind;
    /** "15", "12.5". */
    percent: string | null;
    /** "10.00". */
    amount: string | null;
    currency: string | null;
    appliesTo: DiscountReach;
    targets: { id: string; name: string }[];
    startsAt: string | null;
    endsAt: string | null;
    usageLimit: number | null;
    used: number;
    state: DiscountState;
}

export interface DiscountInput {
    code?: string;
    description?: string | null;
    kind?: DiscountKind;
    percent?: string;
    amount?: string;
    currency?: string;
    appliesTo?: DiscountReach;
    targetIds?: string[];
    startsAt?: string | null;
    endsAt?: string | null;
    usageLimit?: number | null;
}

export async function listDiscounts(): Promise<Discount[]> {
    const base = await orgBase();
    if (!base) return [];
    return (await getJson<Discount[]>(`${base}/discounts`)) ?? [];
}

export async function getDiscount(id: string): Promise<Discount | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<Discount>(`${base}/discounts/${encodeURIComponent(id)}`);
}

async function write(
    path: string,
    method: "POST" | "PATCH",
    input: DiscountInput,
): Promise<ApiResult<Discount>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business." };
    const res = await apiFetch(`${base}${path}`, {
        method,
        body: JSON.stringify(input),
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: body as Discount };
    return toFailure(body, "Could not save that code.");
}

export function createDiscount(input: DiscountInput) {
    return write("/discounts", "POST", input);
}

export function updateDiscount(id: string, input: DiscountInput) {
    return write(`/discounts/${encodeURIComponent(id)}`, "PATCH", input);
}
