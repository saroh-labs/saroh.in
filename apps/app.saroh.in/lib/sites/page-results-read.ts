"use server";

import { apiFetch, orgBase } from "@/lib/api/http";

/**
 * A page's results, "This page · last 7 days" (website editor plan U47a),
 * `GET …/sites/:siteId/results?path=`. Only what is measured: a part is
 * null when its module is off or it has never been counted by page, and
 * carries `since` (an ISO date) when counting began inside the window.
 * `results` is null for someone who may not read Insights.
 *
 * Never throws: a failed read is `{ ok: false }`, never an empty result.
 */

export interface ResultPart {
    count: number;
    since: string | null;
}

export interface PageResults {
    path: string;
    from: string;
    to: string;
    visits: ResultPart | null;
    questions: ResultPart | null;
    started: ResultPart | null;
    paid: ResultPart | null;
    sells: { bookings: boolean; shop: boolean };
}

export type PageResultsRead =
    { ok: true; results: PageResults | null } | { ok: false };

export async function readPageResults(
    siteId: string,
    path: string,
): Promise<PageResultsRead> {
    try {
        const base = await orgBase();
        if (!base) return { ok: false };
        const res = await apiFetch(
            `${base}/sites/${siteId}/results?path=${encodeURIComponent(path)}`,
        );
        if (!res.ok) return { ok: false };
        const body: unknown = await res.json();
        return typeof body === "object" && body !== null && "results" in body
            ? {
                  ok: true,
                  results: (body.results as PageResults | null) ?? null,
              }
            : { ok: false };
    } catch {
        return { ok: false };
    }
}
