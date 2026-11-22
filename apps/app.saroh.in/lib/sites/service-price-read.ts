"use server";

import { permits } from "@/lib/organizations/permits";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { readService } from "@/lib/services/service";

/**
 * One service's name, price and length, for the editor's price sheet
 * (website editor plan U48). A failed or refused read is `{ ok: false }`,
 * never a price of nothing.
 */
export interface ServicePrice {
    name: string;
    /** Minor units; null when the service has no price. */
    priceCents: number | null;
    currency: string | null;
    durationMinutes: number;
    /**
     * This person's role may change it (`service:write`, O1). Only what the
     * sheet draws; the API refuses the save on its own.
     */
    canWrite: boolean;
}

export type ServicePriceRead =
    | { ok: true; data: ServicePrice }
    | { ok: false; reason: "missing" | "forbidden" | "failed" };

export async function readServicePrice(
    serviceId: string,
): Promise<ServicePriceRead> {
    const [read, organization] = await Promise.all([
        readService(serviceId),
        activeOrganizationOnce().catch(() => null),
    ]);
    if (!read.ok) return read;
    const s = read.service;
    return {
        ok: true,
        data: {
            name: s.name,
            priceCents: s.priceCents,
            currency: s.currency,
            durationMinutes: s.durationMinutes,
            canWrite: permits(organization, "service:write"),
        },
    };
}
