import { ApiError } from "@/lib/api/errors";
import { apiFetch, orgBase } from "@/lib/api/http";

import type { AuditEventRow } from "./activity";
import { ACTIVITY_ACTIONS } from "./activity";

/**
 * The last changes to this business's settings and team, newest first, from
 * `GET /organizations/:id/audit` (`audit:read`: Owner and Admin). Server-only,
 * through `lib/api/http.ts`.
 *
 * A 403 is a role decision and comes back as `denied`; any other failure
 * throws to the segment boundary, so a failed read is never an empty list.
 */
export const ACTIVITY_LIMIT = 50;

export type SettingsActivityRead =
    { status: "ok"; events: AuditEventRow[] } | { status: "denied" };

export async function listSettingsActivity(): Promise<SettingsActivityRead> {
    const base = await orgBase();
    if (!base) return { status: "ok", events: [] };
    const query = new URLSearchParams({
        limit: String(ACTIVITY_LIMIT),
        actions: ACTIVITY_ACTIONS.join(","),
    });
    const res = await apiFetch(`${base}/audit?${query}`);
    if (res.status === 403) return { status: "denied" };
    if (!res.ok) throw new ApiError(res.status, "GET audit");
    const body = (await res.json()) as { events?: AuditEventRow[] };
    return { status: "ok", events: body.events ?? [] };
}
