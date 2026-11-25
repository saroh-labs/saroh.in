"use client";

import { useSitesStaleOnLeave } from "@/lib/sites/use-sites";

/**
 * Inside the editors' query provider: leaving marks the Website area's
 * reads stale, since the editor's own writes aren't on React Query.
 */
export function SitesStaleOnLeave() {
    useSitesStaleOnLeave();
    return null;
}
