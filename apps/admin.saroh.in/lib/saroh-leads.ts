import { getJson } from "./control-plane";
import type { LeadsBoard, OwnerFilter } from "./saroh-lead-words";

/**
 * Saroh's own sales leads (DEC-169, admin console U20), as the console reads
 * them. Server-only: it reads through `control-plane.ts`. The API scopes
 * every read, so an Account manager gets their own leads and nothing else.
 */

/** The board. `null` when the caller may not see leads (403). */
export function getLeadsBoard(query: {
    owner?: OwnerFilter;
    q?: string;
}): Promise<LeadsBoard | null> {
    const search = new URLSearchParams();
    if (query.owner && query.owner !== "all") search.set("owner", query.owner);
    if (query.q?.trim()) search.set("q", query.q.trim());
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return getJson<LeadsBoard>(`/saroh-leads${suffix}`);
}
