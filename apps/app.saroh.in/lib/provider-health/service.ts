import { apiFetch, orgBase } from "@/lib/api/http";

/**
 * Provider & dependency health access (#123). Server-only. The API is OWNER/
 * ADMIN-only and never returns credentials.
 */
export type HealthStatus =
    | "NOT_CONFIGURED"
    | "PENDING"
    | "ACTIVE"
    | "DEGRADED"
    | "FAILED";

export interface ProviderHealth {
    key: "PAYMENTS" | "COMMUNICATIONS" | "DOMAINS";
    label: string;
    status: HealthStatus;
    message: string;
    actionHref: string;
}

export async function listProviderHealth(): Promise<ProviderHealth[]> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(`${base}/provider-health`);
    // 403 → not an owner/admin: no health surface for this actor.
    if (res.status === 403) return [];
    if (!res.ok) throw new Error(`GET provider-health failed: ${res.status}`);
    return (await res.json()) as ProviderHealth[];
}
