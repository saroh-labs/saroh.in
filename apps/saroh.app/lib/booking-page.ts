import type { BookingPageData } from "@saroh/site-blocks";
import { isBookingPage } from "@saroh/site-blocks";

import { env } from "@/env";

const API_URL =
    env.API_URL ?? env.NEXT_PUBLIC_API_URL ?? "https://api.saroh.in";

export type BookingPageLookup =
    | { ok: true; page: BookingPageData }
    | { ok: false; reason: "missing" | "unavailable" };

/**
 * What a site's booking page opens with (U19): its business, the services it
 * offers, the rules. Read server-to-server when the page is rendered, never
 * cached — a service paused a minute ago must not be offered. A 404 is a site
 * with nothing published; anything else going wrong is "unavailable", which
 * the page says in words rather than as a 404.
 */
export async function getBookingPage(
    siteId: string,
): Promise<BookingPageLookup> {
    let res: Response;
    try {
        res = await fetch(
            `${API_URL}/public/sites/${encodeURIComponent(siteId)}/booking`,
            { cache: "no-store", headers: { accept: "application/json" } },
        );
    } catch {
        return { ok: false, reason: "unavailable" };
    }
    if (res.status === 404) return { ok: false, reason: "missing" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const body: unknown = await res.json().catch(() => null);
    return isBookingPage(body)
        ? { ok: true, page: body }
        : { ok: false, reason: "unavailable" };
}
