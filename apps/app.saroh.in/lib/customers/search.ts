import { apiFetch, orgBase } from "@/lib/api/http";
import type { PeekAttention } from "@/lib/services/peek";
import { readAttention } from "@/lib/services/peek-person";

import type { CustomerSearch, CustomerSearchResult } from "./picker";

/**
 * The customer picker's reads (E4). Server-only: the plumbing imports
 * next/headers. The picker reaches them through `lib/customers/actions.ts`.
 */

/** How many the picker shows. */
export const PICKER_LIMIT = 8;

/**
 * `GET contacts/search` (`contact:read`): the most recent first, by name or
 * phone. A caller without the read is told so (`forbidden`), so the picker
 * offers only "+ Add"; any other failure is a failure, never an empty list.
 */
export async function searchCustomers(
    query: string,
    limit: number = PICKER_LIMIT,
): Promise<CustomerSearch> {
    const base = await orgBase();
    if (!base) return { ok: false, forbidden: false };
    const params = new URLSearchParams({ limit: String(limit) });
    const q = query.trim();
    if (q) params.set("q", q);
    try {
        const res = await apiFetch(`${base}/contacts/search?${params}`);
        if (res.status === 403) return { ok: false, forbidden: true };
        if (!res.ok) return { ok: false, forbidden: false };
        const rows = (await res.json()) as unknown;
        if (!Array.isArray(rows)) return { ok: false, forbidden: false };
        return { ok: true, results: rows.map(toResult) };
    } catch {
        return { ok: false, forbidden: false };
    }
}

function toResult(row: Partial<CustomerSearchResult>): CustomerSearchResult {
    return {
        id: String(row.id),
        name: row.name ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        lastSeenAt: row.lastSeenAt ?? null,
        exactOn: Array.isArray(row.exactOn) ? row.exactOn : [],
    };
}

/**
 * A picked person's Needs attention (C1): what this viewer may see, and a
 * count of the sensitive ones they may not. Null when it can't be read.
 */
export async function readCustomerAttention(
    contactId: string,
): Promise<PeekAttention | null> {
    const base = await orgBase();
    if (!base) return null;
    return readAttention(base, contactId);
}
