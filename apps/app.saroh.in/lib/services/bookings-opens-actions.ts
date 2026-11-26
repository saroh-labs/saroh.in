"use server";

import { writeAsOrgIfSent } from "@/lib/api/assert-active-org";
import type { CrmResult } from "@/lib/api/http";

import type { BookingsOpens } from "./bookings-opens";
import { readBookingsOpens, writeBookingsOpens } from "./bookings-opens-read";

/**
 * Change where Bookings opens for the signed-in person (DEC-170): "Start
 * Bookings on", "Show bookings for", or who they last picked. Only what
 * changed is sent; the rest is read from what is kept, so two quick picks
 * never undo each other. The API takes the person from the session.
 */
export async function saveBookingsOpens(
    change: Partial<BookingsOpens>,
    /** The tab's business (DEC-259): a moved tab is refused. */
    orgId?: string,
): Promise<CrmResult<BookingsOpens>> {
    if (orgId) return writeAsOrgIfSent(orgId, () => saveBookingsOpens(change));
    const next = { ...(await readBookingsOpens()), ...change };
    const result = await writeBookingsOpens(next);
    return result.ok ? { ok: true, data: next } : result;
}
