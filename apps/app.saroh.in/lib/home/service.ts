import { apiFetch, orgBase } from "@/lib/api/http";

/**
 * Home read-model access (#119). One aggregated call to api.saroh.in returns the
 * ranked next-actions for the active Organization, so the page never fans out.
 * Server-only.
 */
export type HomeSeverity = "ATTENTION" | "SETUP" | "OVERDUE" | "SUGGESTION";

export interface HomeAction {
    code: string;
    title: string;
    href: string;
    severity: HomeSeverity;
    moduleKey?: string;
}

export interface HomeModel {
    actions: HomeAction[];
    primaryAction: HomeAction | null;
    hasAnyModule: boolean;
}

const EMPTY: HomeModel = {
    actions: [],
    primaryAction: null,
    hasAnyModule: false,
};

export async function getHome(projectId?: string): Promise<HomeModel> {
    const base = await orgBase();
    if (!base) return EMPTY;
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    const res = await apiFetch(`${base}/home${qs}`);
    if (!res.ok) {
        throw new Error(`GET home failed: ${res.status}`);
    }
    return (await res.json()) as HomeModel;
}
