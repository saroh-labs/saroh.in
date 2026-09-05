import { apiFetch, orgBase } from "@/lib/api/http";

/**
 * Provider & dependency health access (#123). Server-only. The API is OWNER/
 * ADMIN-only and never returns credentials.
 */
export type HealthStatus =
    "NOT_CONFIGURED" | "PENDING" | "ACTIVE" | "DEGRADED" | "FAILED";

export interface ProviderHealth {
    key: "PAYMENTS" | "COMMUNICATIONS" | "DOMAINS";
    label: string;
    status: HealthStatus;
    message: string;
    actionHref: string;
}

/**
 * Provider health, or the reason there is none to show (#177, §30).
 *
 * This used to collapse a 403 into `[]`, which made "no providers are
 * configured" and "your role may not see this" the same value — so the page
 * rendered both as an empty state and the merchant could not tell which was
 * true. §30 asks for permission denial to be explained rather than presented
 * as an absence, and the page can only do that if the service says which
 * happened.
 */
export type ProviderHealthResult =
    { status: "ok"; health: ProviderHealth[] } | { status: "denied" };

export async function listProviderHealth(): Promise<ProviderHealthResult> {
    const base = await orgBase();
    // No active organization is not a denial — there is simply nothing scoped
    // to read yet.
    if (!base) return { status: "ok", health: [] };

    const res = await apiFetch(`${base}/provider-health`);
    if (res.status === 403) return { status: "denied" };
    if (!res.ok) throw new Error(`GET provider-health failed: ${res.status}`);
    return { status: "ok", health: (await res.json()) as ProviderHealth[] };
}
