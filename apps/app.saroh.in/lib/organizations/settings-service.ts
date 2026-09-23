import { toFailure } from "@/lib/api/failure";
import { apiFetch, getJson, orgBase } from "@/lib/api/http";

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

/** GST (ADR-008). The GSTIN is the profile's `taxId`. */
export interface TaxSettings {
    registered: boolean;
    /** A GST state code, e.g. "29", and its name. */
    state: string | null;
    stateName: string | null;
    invoicePrefix: string | null;
    /** Percent, e.g. "18". */
    deliveryRate: string;
    deliverySac: string | null;
}

/**
 * The registered address printed on invoices (CGST rule 46). Its state is
 * the GST state — the same as `tax.state`.
 */
export interface RegisteredAddress {
    line1: string | null;
    line2: string | null;
    city: string | null;
    postalCode: string | null;
    state: string | null;
    stateName: string | null;
}

export interface OrganizationSettings {
    id: string;
    name: string;
    slug: string;
    profile: OrganizationProfile | null;
    /** The earliest order in the business, ISO; `null` before the first. */
    tradingSince: string | null;
    /** Absent only from an API older than GST (U5). */
    tax?: TaxSettings;
    /** Absent only from an API older than the registered address. */
    registeredAddress?: RegisteredAddress;
}

export interface TaxSettingsInput {
    registered?: boolean;
    state?: string;
    invoicePrefix?: string;
    deliveryRate?: string;
    deliverySac?: string;
}

export interface OrganizationSettingsInput {
    name?: string;
    profile?: Partial<Record<keyof OrganizationProfile, string>>;
    tax?: TaxSettingsInput;
    /** "" clears a line; the state goes as `tax.state`. */
    registeredAddress?: Partial<
        Record<"line1" | "line2" | "city" | "postalCode", string>
    >;
}

/** A refusal names the field it is about when the API says which. */
export type SettingsResult<T> =
    { ok: true; data: T } | { ok: false; error: string; field?: string };

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
    const data = (await res
        .json()
        .catch(() => null)) as OrganizationSettings | null;

    if (!res.ok || !data) {
        return toFailure(data, "Could not save your organization.");
    }
    return { ok: true, data };
}
