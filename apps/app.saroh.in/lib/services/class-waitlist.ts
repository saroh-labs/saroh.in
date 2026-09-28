import { apiFetch, orgBase } from "@/lib/api/http";

import type { ClassWaitlistRow } from "./class-waitlist-words";

export type { ClassWaitlistRow } from "./class-waitlist-words";

/**
 * A class's waitlist, for the team (round-2 A12): who is in line for one
 * session, in order — a place held for someone first, then everyone
 * waiting. Customers join and leave from the booking page on the
 * business's site; a freed place is offered by the API, never from here.
 * Server-only, like `service.ts`.
 */

/**
 * The line for one session (`booking:read`). Null when it couldn't be read
 * — the page then says so, never "Nobody waiting".
 */
export async function readClassWaitlist(
    serviceId: string,
    startAt: string,
): Promise<ClassWaitlistRow[] | null> {
    const base = await orgBase();
    if (!base) return null;
    const query = new URLSearchParams({ startAt });
    const res = await apiFetch(
        `${base}/services/${encodeURIComponent(serviceId)}/waitlist?${query}`,
    );
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as {
        rows?: ClassWaitlistRow[];
    } | null;
    return Array.isArray(body?.rows) ? body.rows : null;
}
