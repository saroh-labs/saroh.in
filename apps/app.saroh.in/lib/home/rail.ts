import { cache } from "react";

import { apiFetch, orgBase } from "@/lib/api/http";

import type { HomeAction, HomeUnavailable } from "./service";

/**
 * The rail's badges (review #16): the ranked actions alone, which is all
 * the shell counts. The shell reads this on every page, hard load and
 * refresh, so it asks `GET /home?parts=rail`, which skips everything only
 * Home's page draws, rather than the whole of Home. Once per request.
 */
export interface HomeRail {
    actions: HomeAction[];
    unavailable: HomeUnavailable[];
}

export const getHomeRail = cache(readHomeRail);

async function readHomeRail(): Promise<HomeRail> {
    const base = await orgBase();
    if (!base) return { actions: [], unavailable: [] };
    const res = await apiFetch(`${base}/home?parts=rail`);
    if (!res.ok) {
        throw new Error(`GET home rail failed: ${res.status}`);
    }
    const read = (await res.json()) as Partial<HomeRail>;
    return {
        actions: Array.isArray(read.actions) ? read.actions : [],
        unavailable: Array.isArray(read.unavailable) ? read.unavailable : [],
    };
}
