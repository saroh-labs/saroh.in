import { apiFetch, getJson, orgBase, readError } from "@/lib/api/http";

/**
 * Organization settings access (name + business profile).
 *
 * Separate from `service.ts` because it hits the OWNER/ADMIN-only
 * `/organizations/:id/settings` endpoint: the business profile carries legal and
 * tax identity, which the API deliberately keeps out of the `org:read` floor a
 * MEMBER has. Server-only.
 */
export interface OrganizationProfile {
    legalName: string | null;
    type: string | null;
    country: string | null;
    taxId: string | null;
    contactEmail: string | null;
    website: string | null;
}

export interface OrganizationSettings {
    id: string;
    name: string;
    slug: string;
    profile: OrganizationProfile | null;
}

export interface OrganizationSettingsInput {
    name?: string;
    profile?: Partial<Record<keyof OrganizationProfile, string>>;
}

export type SettingsResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string };

/** The active org's editable identity. Null when no org is active. */
export async function getOrganizationSettings(): Promise<OrganizationSettings | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<OrganizationSettings>(`${base}/settings`);
}

/**
 * Apply a partial update. PATCH semantics all the way down: fields the caller
 * omits are left alone rather than blanked, so editing the name never clears
 * the tax id.
 */
export async function updateOrganizationSettings(
    input: OrganizationSettingsInput,
): Promise<SettingsResult<OrganizationSettings>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active organization." };

    const res = await apiFetch(base, {
        method: "PATCH",
        body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as
        | (OrganizationSettings & { message?: string; error?: string })
        | null;

    if (!res.ok || !data) {
        return {
            ok: false,
            error: readError(data, "Could not save your organization."),
        };
    }
    return { ok: true, data };
}
