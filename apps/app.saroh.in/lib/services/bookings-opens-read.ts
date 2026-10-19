import type { CrmResult } from "@/lib/api/http";
import { apiFetch, mutate, orgBase } from "@/lib/api/http";

import type { BookingsOpens } from "./bookings-opens";
import {
    OPENS_DEFAULT,
    OPENS_NAME,
    OPENS_RESOURCE,
    readOpens,
} from "./bookings-opens";

/**
 * Where Bookings opens for the signed-in person (DEC-170), kept by the API
 * as their one saved view of the calendar. Server-only, through the shared
 * HTTP plumbing.
 */

/**
 * Their choices, or the defaults when there are none or they could not be
 * read. Never throws and never calls `forbidden()`: a failed read only
 * means Bookings opens as it always did.
 */
export async function readBookingsOpens(): Promise<BookingsOpens> {
    try {
        const base = await orgBase();
        if (!base) return OPENS_DEFAULT;
        const res = await apiFetch(
            `${base}/saved-views?resource=${encodeURIComponent(OPENS_RESOURCE)}`,
        );
        if (!res.ok) return OPENS_DEFAULT;
        const views = (await res.json()) as unknown;
        if (!Array.isArray(views)) return OPENS_DEFAULT;
        const kept = (views as { name?: unknown; filters?: unknown }[])
            .filter((v) => v.name === OPENS_NAME)
            .at(-1);
        return kept ? readOpens(kept.filters) : OPENS_DEFAULT;
    } catch {
        return OPENS_DEFAULT;
    }
}

/** Keep their choices; the API answers with the view it kept. */
export function writeBookingsOpens(
    opens: BookingsOpens,
): Promise<CrmResult<unknown>> {
    return mutate(
        "/saved-views",
        "PUT",
        { resource: OPENS_RESOURCE, name: OPENS_NAME, filters: opens },
        "Couldn't keep that choice",
    );
}
