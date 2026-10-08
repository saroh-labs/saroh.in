import type { LaunchOfferTerms } from "@/content/waitlist";
import { env } from "@/env";

import { withBuildRetries } from "./build-retry";

/**
 * The launch offer, read from api.saroh.in (`GET /public/waitlist/offer`,
 * marketing plan U31): the plan the opening-day invites put a business on,
 * named as the live catalogue names it, and `LAUNCH_OFFER_DAYS`. The page
 * and the invites read the same setting, so they can't disagree, and
 * neither number is ever written in this repo.
 *
 * Cached for five minutes (ISR), the API's own `max-age`. Anything short of
 * a valid offer — no `API_URL`, a 404 (no offer set), an error, a slow or
 * malformed answer — is null, and the page keeps "Offer details announced
 * at launch". An offer that can't be read is never shown half right.
 */

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
    const deploying =
        env.NEXT_PHASE === "phase-production-build" && Boolean(env.VERCEL_ENV);
    const once = async (): Promise<LaunchOfferTerms | null> => {
        const res = await fetcher(`${api}/public/waitlist/offer`, {
            headers: { accept: "application/json" },
            // Read once, when the page is built (the site is static).
            cache: "force-cache",
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 404) return null;
        if (!res.ok)
            throw new Error(`GET /public/waitlist/offer: ${res.status}`);
        const offer = parseLaunchOffer(await res.json());
        if (!offer) throw new Error("The launch offer answer is malformed");
        return offer;
    };
    try {
        // A deployment's build rides out an API restart (`build-retry.ts`).
        return deploying ? await withBuildRetries(once) : await once();
    } catch (err) {
        // A deployment's build fails rather than publish the placeholder over
        // a real offer (the site is static; see `readLivePricing`).
        if (deploying) throw err;
        console.warn(
            "[waitlist] the launch offer could not be read; showing the placeholder",
            err instanceof Error ? err.message : err,
        );
        return null;
    }
}
