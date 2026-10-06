"use client";

import { useCallback, useEffect, useState } from "react";

import type { PublicVisit } from "./public-visit";
import { isPublicVisit } from "./public-visit";

/**
 * The public visit read (G8) for a block that shows a place's week: the
 * Opening hours block and the full-bleed hero's open-or-closed line (U2).
 *
 *   GET ${apiUrl}/public/sites/:siteId/visit/:storeId   — one shop
 *   GET ${apiUrl}/public/sites/:siteId/visit            — the business's own
 *
 * The same read, and the same rule for "Open now" (`opening-hours.ts`), as
 * Visit us and the booking page's header, so the four never disagree.
 *
 * - `given`: a sample place (catalog, tests); nothing is fetched.
 * - `siteId` undefined: no site is live here (the editor's canvas); the
 *   state stays `idle` and the block says what it will show.
 * - `siteId` null: a live render that could not tell; `ready` with no place.
 * - 404: the place is gone or closed; `ready` with no place, not an error.
 */
export type VisitLoad =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; visit: PublicVisit | null }
    | { kind: "error" };

export function usePublicVisit({
    siteId,
    storeId,
    apiUrl,
    given,
    enabled = true,
}: {
    siteId?: string | null;
    storeId?: string | null;
    apiUrl: string;
    given?: PublicVisit;
    /** False: no read at all (the line is switched off). */
    enabled?: boolean;
}): { state: VisitLoad; retry: () => void } {
    const initial: VisitLoad = given
        ? { kind: "ready", visit: given }
        : !enabled || siteId === undefined
          ? { kind: "idle" }
          : siteId === null
            ? { kind: "ready", visit: null }
            : { kind: "loading" };
    const [state, setState] = useState<VisitLoad>(initial);

    const load = useCallback(async (): Promise<VisitLoad> => {
        if (!siteId) return { kind: "ready", visit: null };
        const path = storeId
            ? `/visit/${encodeURIComponent(storeId)}`
            : "/visit";
        try {
            const res = await fetch(
                `${apiUrl}/public/sites/${encodeURIComponent(siteId)}${path}`,
                { headers: { accept: "application/json" } },
            );
            if (res.status === 404) return { kind: "ready", visit: null };
            if (!res.ok) return { kind: "error" };
            const body: unknown = await res.json().catch(() => null);
            // Narrowed, not cast (#264).
            return isPublicVisit(body)
                ? { kind: "ready", visit: body }
                : { kind: "error" };
        } catch {
            return { kind: "error" };
        }
    }, [apiUrl, siteId, storeId]);

    useEffect(() => {
        if (given || !enabled || !siteId) return;
        let active = true;
        void load().then((next) => {
            if (active) setState(next);
        });
        return () => {
            active = false;
        };
    }, [given, enabled, siteId, load]);

    const retry = useCallback(() => {
        setState({ kind: "loading" });
        void load().then(setState);
    }, [load]);

    // A sample place is drawn as given, whenever it changes.
    return { state: given ? { kind: "ready", visit: given } : state, retry };
}
