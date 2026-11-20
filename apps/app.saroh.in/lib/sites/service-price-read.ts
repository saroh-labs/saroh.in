"use server";

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
}

export type ServicePriceRead =
    | { ok: true; data: ServicePrice }
    | { ok: false; reason: "missing" | "forbidden" | "failed" };

export async function readServicePrice(
    serviceId: string,
): Promise<ServicePriceRead> {
    const read = await readService(serviceId);
    if (!read.ok) return read;
    const s = read.service;
    return {
        ok: true,
        data: {
            name: s.name,
            priceCents: s.priceCents,
            currency: s.currency,
            durationMinutes: s.durationMinutes,
        },
    };
}
