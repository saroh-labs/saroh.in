import { apiFetch, orgBase } from "@/lib/api/http";

/**
 * Home read-model access (#119). One aggregated call to api.saroh.in returns the
 * ranked next-actions for the active Organization, so the page never fans out.
 * Server-only.
 */
export type HomeSeverity = "ATTENTION" | "SETUP" | "OVERDUE" | "SUGGESTION";

/**
 * One concrete row behind an action's count.
 *
 * `currency` is nullable on purpose and the client MUST respect it: a CRM lead
 * records an amount with no currency at all, while an order records one
 * explicitly. Rendering a symbol the API did not send would be inventing the
 * merchant's currency from their locale.
 */
export interface HomeEvidence {
    id: string;
    title: string;
    subtitle: string | null;
    at: string | null;
    amountMinor: number | null;
    currency: string | null;
    href: string;
}

export interface HomeAction {
    code: string;
    title: string;
    href: string;
    severity: HomeSeverity;
    moduleKey?: string;
    /** The true total, which may exceed `evidence.length`. */
    count?: number;
    evidence?: HomeEvidence[];
}

/** A booking on the schedule band, in the timezone it was booked in. */
export interface HomeBooking {
    id: string;
    startAt: string;
    endAt: string;
    timezone: string;
    serviceName: string;
    who: string | null;
    status: string;
    href: string;
}

/** A count whose `href` lands on exactly the rows it counts. */
export interface HomeNumber {
    key: string;
    label: string;
    value: number;
    href: string;
    moduleKey?: string;
}

/**
 * A part of Home that could not be read (#177, §30).
 *
 * The API distinguishes "you have no open orders" from "we could not find out",
 * and Home has to render that difference — a screen that silently drops a
 * failed source reports "nothing to do" when the truth is "we do not know".
 */
export interface HomeUnavailable {
    moduleKey: string;
    label: string;
}

export interface HomeModel {
    actions: HomeAction[];
    primaryAction: HomeAction | null;
    hasAnyModule: boolean;
    upcoming: HomeBooking[];
    numbers: HomeNumber[];
    /** Empty on a healthy read; non-empty means what is shown is incomplete. */
    unavailable: HomeUnavailable[];
}

const EMPTY: HomeModel = {
    actions: [],
    primaryAction: null,
    hasAnyModule: false,
    upcoming: [],
    numbers: [],
    unavailable: [],
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
