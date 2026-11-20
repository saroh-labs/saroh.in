"use server";

import { apiFetch, orgBase } from "@/lib/api/http";

/**
 * Where a service shows on a site, for the price sheet (website editor plan
 * U47a, U48): `GET …/sites/:siteId/services/:serviceId/uses`. Pages, draft
 * and live, whose sections are bound to it, and whether the booking page
 * offers it. Needs `service:read`.
 *
 * Never throws: a failed or refused read is `{ ok: false }`, never "used
 * nowhere".
 */

export interface ServiceUseSection {
    /** Null for a live page published before keys. */
    key: string | null;
    label: string;
    draft: boolean;
    live: boolean;
}

export interface ServiceUsePage {
    pageId: string | null;
    title: string;
    path: string;
    sections: ServiceUseSection[];
}

export interface ServiceUses {
    serviceId: string;
    pages: ServiceUsePage[];
    /** The booking page offers it; new bills always use its price. */
    bookingPage: boolean;
}

export type ServiceUsesRead = { ok: true; data: ServiceUses } | { ok: false };

export async function readServiceUses(
    siteId: string,
    serviceId: string,
): Promise<ServiceUsesRead> {
    try {
        const base = await orgBase();
        if (!base) return { ok: false };
        const res = await apiFetch(
            `${base}/sites/${siteId}/services/${serviceId}/uses`,
        );
        if (!res.ok) return { ok: false };
        const body = (await res.json()) as ServiceUses | null;
        return body && Array.isArray(body.pages)
            ? { ok: true, data: body }
            : { ok: false };
    } catch {
        return { ok: false };
    }
}
