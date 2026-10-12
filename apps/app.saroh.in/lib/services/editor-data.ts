import { apiFetch, orgBase } from "@/lib/api/http";
import { readMissingRates } from "@/lib/gst-rates/service";
import type { GstPriceMode } from "@/lib/gst/price-mode";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { listSites } from "@/lib/sites/service";
import type { BookingPaymentView, StaffList } from "@/lib/staff/service";
import { listStaff, readBookingPayment } from "@/lib/staff/service";

import type { Service } from "./service";
import { readServices } from "./service";

/**
 * What the Services list and the Service Editor both read beside the
 * services (E2): who is on the diary, whether the business has a booking
 * page, and whether this person may change services. Each degrades on its
 * own to null ("couldn't tell"), never to "none".
 */

export async function readStaffOrNull(): Promise<StaffList | null> {
    try {
        return await listStaff();
    } catch {
        return null;
    }
}

/**
 * Whether the business has a booking page: its website has gone live, and
 * the booking page is part of every live site. Null when the sites couldn't
 * be read, or the role can't read them.
 */
export async function readHasBookingPage(): Promise<boolean | null> {
    try {
        const sites = await listSites();
        return sites.some((s) => Boolean(s.currentPublicationId));
    } catch {
        return null;
    }
}

/**
 * Whether the business has a storefront to sell a treatment from (E10,
 * DEC-050). Null when it couldn't be told — Sell switched off, a role
 * that can't read storefronts, or the API down — which leaves the refusal
 * to the API. Read with a bare fetch: a 403 here is "couldn't tell", never
 * the page's own forbidden.
 */
export async function readHasStorefront(): Promise<boolean | null> {
    try {
        const base = await orgBase();
        if (!base) return null;
        const res = await apiFetch(`${base}/storefronts`);
        if (!res.ok) return null;
        const list: unknown = await res.json();
        return Array.isArray(list) ? list.length > 0 : null;
    } catch {
        return null;
    }
}

/** Whether this person may change services (`service:write`). */
export async function readCanEditServices(): Promise<boolean> {
    const organization = await resolveActiveOrganization();
    return organization?.actions
        ? organization.actions.includes("service:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
}

/** The business's currency: the one its services are priced in. */
export function businessCurrencyOf(services: readonly Service[]): string {
    return services.find((s) => s.currency)?.currency ?? "INR";
}

export interface EditorContext {
    services: Service[];
    staff: StaffList | null;
    hasPage: boolean | null;
    /** A storefront to sell treatments from (E10); null when unknown. */
    hasStorefront: boolean | null;
    /**
     * How people pay when they book, and whether online can be taken
     * (DEC-088); null when unknown, which warns about nothing.
     */
    payment: BookingPaymentView | null;
    /**
     * Whether the business is GST-registered: its priced services need a
     * GST rate (12 Oct 2026). Null when it couldn't be told, which asks
     * for nothing.
     */
    gstRegistered: boolean | null;
    /**
     * How a registered business's prices carry GST (12 Oct 2026), for the
     * editor's "Same as the business (…)". Null when the business isn't
     * registered, or it couldn't be read (a role without the settings).
     */
    businessPriceMode: GstPriceMode | null;
    canEdit: boolean;
    /** The business's zone: the diary's, else its services', else India. */
    timezone: string;
    currency: string;
}

/** Everything the editor reads, in parallel. Null when services failed. */
export async function loadEditorContext(): Promise<
    { ok: true; context: EditorContext } | { ok: false; forbidden: boolean }
> {
    const [read, staff, hasPage, canEdit, hasStorefront, payment, rates] =
        await Promise.all([
            readServices(),
            readStaffOrNull(),
            readHasBookingPage(),
            readCanEditServices(),
            readHasStorefront(),
            readBookingPayment(),
            // Registered or not comes with the missing-rates read, which a
            // role that can't read the business's settings can still make.
            readMissingRates(),
        ]);
    if (!read.ok) return read;
    return {
        ok: true,
        context: {
            services: read.services,
            staff,
            hasPage,
            hasStorefront,
            payment,
            gstRegistered: rates?.registered ?? null,
            businessPriceMode: rates?.priceMode ?? null,
            canEdit,
            timezone:
                staff?.timezone ??
                read.services.at(0)?.timezone ??
                "Asia/Kolkata",
            currency: businessCurrencyOf(read.services),
        },
    };
}
