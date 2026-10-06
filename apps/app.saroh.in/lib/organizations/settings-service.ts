import { toFailure } from "@/lib/api/failure";
import { apiFetch, getJson, orgBase } from "@/lib/api/http";
import type {
    NumberFormat,
    NumberRestart,
} from "@/lib/invoices/invoice-number";

import type { OrganizationKind } from "./kind";
import type { PayInstructionsSettings, PayValues } from "./pay-instructions";

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
    /**
     * The IANA zone the business keeps time in; null until set (invoice
     * numbers and the calendar then read India's). Absent from an older API.
     */
    timezone?: string | null;
    /**
     * The phone the business's website shows (DEC-053), E.164
     * ("+919845012345"); null when none is set. Absent from an older API.
     */
    phone?: string | null;
    /**
     * Setup's answer to "Is it registered?": true for Registered, which saves
     * no type, so the take-money checklist asks for the real one before the
     * business goes live; false for Not registered; null when it wasn't
     * asked. Absent from an older API, and read as not asked.
     */
    registered?: boolean | null;
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
    /** How invoice numbers are built; absent from an older API: the default. */
    invoiceNumber?: InvoiceNumberSettings;
}

/**
 * The business's number format — chosen (`custom`), or the default for its
 * GST standing — and the last number each of its invoice series took in the
 * current period, per way of restarting (0: none yet).
 */
export interface InvoiceNumberSettings extends NumberFormat {
    custom: boolean;
    counters: Record<NumberRestart, number>;
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

/** The checklist's facts (`OrganizationSettings.setup`). */
export interface SetupFacts {
    products: number;
    services: number;
    sites: number;
    sitesNotLive: number;
    /**
     * Invoices that aren't void (DEC-070). Absent from an API older than
     * it; whether the business handles money is then read from the modules
     * alone.
     */
    invoices?: number;
}

export interface OrganizationSettings {
    id: string;
    name: string;
    slug: string;
    /**
     * What is being set up (DEC-070); words and defaults only. Absent from
     * an API older than it — read it through `kindOf`.
     */
    kind?: OrganizationKind;
    profile: OrganizationProfile | null;
    /** The earliest order in the business, ISO; `null` before the first. */
    tradingSince: string | null;
    /**
     * What the take-money checklist ticks, counted by the API: products and
     * services not archived, websites, and those with nothing published now.
     * Absent from an API older than it; the checklist then reads the
     * modules' readiness as before.
     */
    setup?: SetupFacts;
    /** Absent only from an API older than GST (U5). */
    tax?: TaxSettings;
    /** Absent only from an API older than the registered address. */
    registeredAddress?: RegisteredAddress;
    /**
     * The logo printed at the top of invoices and receipts; null until one
     * is set, absent from an API older than it.
     */
    logo?: BusinessLogo | null;
    /**
     * "How to pay us" (R32): the UPI ID, bank details and note customers
     * see on their own unpaid invoices, orders and desk bookings. Absent
     * from an API older than it: none set.
     */
    payInstructions?: PayInstructionsSettings;
}

export interface BusinessLogo {
    url: string;
    mediaId: string | null;
}

export interface TaxSettingsInput {
    registered?: boolean;
    state?: string;
    invoicePrefix?: string;
    deliveryRate?: string;
    deliverySac?: string;
    /** Sent whole when changed. */
    invoiceNumber?: NumberFormat;
}

export interface OrganizationSettingsInput {
    name?: string;
    /**
     * What is being set up (DEC-070, K5): words and defaults only. Needs
     * `org:update`, as the name does.
     */
    kind?: OrganizationKind;
    profile?: Partial<Record<keyof OrganizationProfile, string>>;
    tax?: TaxSettingsInput;
    /** "" clears a line; the state goes as `tax.state`. */
    registeredAddress?: Partial<
        Record<"line1" | "line2" | "city" | "postalCode", string>
    >;
    /** How to pay us (R32): only the fields changed; "" clears one. */
    payInstructions?: Partial<PayValues>;
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
 * The settings read for a step outside Settings ("Add your business
 * details", DEC-068), as a result rather than a throw: a role that may not
 * read them (403) is told so in place, never sent to a forbidden page.
 */
export async function readOrganizationSettings(): Promise<
    | { ok: true; data: OrganizationSettings }
    | { ok: false; error: string; forbidden: boolean }
> {
    const base = await orgBase();
    if (!base) {
        return {
            ok: false,
            error: "No active organization.",
            forbidden: false,
        };
    }
    const res = await apiFetch(`${base}/settings`);
    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok || !data) {
        return {
            ...toFailure(data, "Couldn't read your business details."),
            forbidden: res.status === 403,
        };
    }
    return { ok: true, data: data as OrganizationSettings };
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

/**
 * Set the business logo to an image already uploaded to the library, or
 * take it off (`mediaId` null; the image stays in the library).
 */
export async function updateBusinessLogo(
    mediaId: string | null,
): Promise<SettingsResult<OrganizationSettings>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active organization." };

    const res = await apiFetch(
        `${base}/logo`,
        mediaId
            ? { method: "PUT", body: JSON.stringify({ mediaId }) }
            : { method: "DELETE" },
    );
    const data = (await res
        .json()
        .catch(() => null)) as OrganizationSettings | null;

    if (!res.ok || !data) {
        return toFailure(
            data,
            mediaId ? "Could not save the logo." : "Could not remove the logo.",
        );
    }
    return { ok: true, data };
}
