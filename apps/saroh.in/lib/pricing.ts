import type { Catalog } from "@saroh/pricing-catalog";
import { parseCatalog } from "@saroh/pricing-catalog";

import { env } from "@/env";

/**
 * Saroh's own pricing, read from api.saroh.in's published catalogue (plans
 * catalogue U24, KTD-10, KTD-E2). Nothing about a price, a limit or a plan's
 * terms lives in this repo: the pages draw whatever `GET /public/pricing`
 * returns, and the "Pricing announced at launch" placeholder when there is
 * nothing to draw.
 *
 * - The published catalogue is cached for five minutes (ISR), the API's own
 *   `max-age`, and refreshed at once by the API's call to `/api/revalidate`.
 * - A draft preview is never cached.
 * - The bundled seed is never a fallback here: the placeholder is.
 */

/** Seconds a published catalogue is served before it is read again. */
export const PRICING_REVALIDATE_SECONDS = 300;

/** How long a read may take before the page gives up on it. */
const TIMEOUT_MS = 5000;

/** `GET /public/pricing`, parsed: the snapshot, and whether it is a draft. */
export interface PricingRead {
    version: number | null;
    preview: boolean;
    catalog: Catalog;
}

/** Parse the API's answer; throws when it isn't a valid catalogue. */
export function parsePricingResponse(body: unknown): PricingRead {
    if (!body || typeof body !== "object") {
        throw new Error("The pricing answer is not an object");
    }
    const b = body as Record<string, unknown>;
    return {
        version: typeof b.version === "number" ? b.version : null,
        preview: b.preview === true,
        catalog: parseCatalog(b.catalog),
    };
}

/** Building the site, rather than serving it. */
function building(): boolean {
    return env.NEXT_PHASE === "phase-production-build";
}

/**
 * The published catalogue, or null when there is none to show.
 *
 * - No `API_URL`, or a 404 (no version installed): null, the placeholder.
 * - The API down, an error answer or a snapshot that doesn't validate:
 *   while building, null (the first build never fails or publishes an empty
 *   page for it); while serving, it throws, so the ISR regeneration fails and
 *   the last good page keeps serving (KTD-10). In development, null.
 */
export async function readLivePricing(
    fetcher: typeof fetch = fetch,
): Promise<Catalog | null> {
    const api = env.API_URL;
    if (!api) return null;
    try {
        const res = await fetcher(`${api}/public/pricing`, {
            headers: { accept: "application/json" },
            next: { revalidate: PRICING_REVALIDATE_SECONDS },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`GET /public/pricing: ${res.status}`);
        return parsePricingResponse(await res.json()).catalog;
    } catch (err) {
        if (building() || env.NODE_ENV !== "production") {
            console.warn(
                "[pricing] the catalogue could not be read; showing the placeholder",
                err instanceof Error ? err.message : err,
            );
            return null;
        }
        throw err;
    }
}

export type PreviewRead =
    | { ok: true; catalog: Catalog }
    | { ok: false; reason: "unavailable" | "expired" };

/**
 * The shared draft, for a staff member's preview token. Never cached; a
 * token the API doesn't accept (expired, forged, or for an older draft) is
 * `expired`, and anything else that goes wrong is `unavailable`.
 */
export async function readPreviewPricing(
    token: string,
    fetcher: typeof fetch = fetch,
): Promise<PreviewRead> {
    const api = env.API_URL;
    if (!api) return { ok: false, reason: "unavailable" };
    try {
        const res = await fetcher(
            `${api}/public/pricing?preview=${encodeURIComponent(token)}`,
            {
                headers: { accept: "application/json" },
                cache: "no-store",
                signal: AbortSignal.timeout(TIMEOUT_MS),
            },
        );
        if (res.status === 404) return { ok: false, reason: "expired" };
        if (!res.ok) return { ok: false, reason: "unavailable" };
        const read = parsePricingResponse(await res.json());
        return { ok: true, catalog: read.catalog };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}
