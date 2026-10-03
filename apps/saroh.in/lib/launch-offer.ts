import type { LaunchOfferTerms } from "@/content/waitlist";
import { env } from "@/env";

/**
 * The launch offer, read from api.saroh.in (`GET /public/waitlist/offer`):
 * the plan the opening-day offer puts a business on, by name, and the API's
 * `LAUNCH_OFFER_DAYS`. The length is set on the API only, so it is never
 * written in this repo.
 *
 * Cached for five minutes (ISR), the API's own `max-age`. Anything short of
 * a valid offer — no `API_URL`, a 404 (no offer set), an error, a slow or
 * malformed answer — is null, and the page keeps "Offer details announced
 * at launch". An offer that can't be read is never shown half right.
 */

/** Seconds an offer is served before it is read again. */
export const OFFER_REVALIDATE_SECONDS = 300;

/** How long a read may take before the page gives up on it. */
const TIMEOUT_MS = 3000;

/** The API's answer, or null when it isn't a whole offer. */
export function parseLaunchOffer(body: unknown): LaunchOfferTerms | null {
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    const planName = typeof b.planName === "string" ? b.planName.trim() : "";
    const days = b.days;
    if (!planName) return null;
    if (
        typeof days !== "number" ||
        !Number.isInteger(days) ||
        days < 1 ||
        days > 366
    ) {
        return null;
    }
    return { planName, days };
}

export async function readLaunchOffer(
    fetcher: typeof fetch = fetch,
): Promise<LaunchOfferTerms | null> {
    const api = env.API_URL;
    if (!api) return null;
    try {
        const res = await fetcher(`${api}/public/waitlist/offer`, {
            headers: { accept: "application/json" },
            next: { revalidate: OFFER_REVALIDATE_SECONDS },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 404) return null;
        if (!res.ok)
            throw new Error(`GET /public/waitlist/offer: ${res.status}`);
        const offer = parseLaunchOffer(await res.json());
        if (!offer) throw new Error("The launch offer answer is malformed");
        return offer;
    } catch (err) {
        console.warn(
            "[waitlist] the launch offer could not be read; showing the placeholder",
            err instanceof Error ? err.message : err,
        );
        return null;
    }
}
