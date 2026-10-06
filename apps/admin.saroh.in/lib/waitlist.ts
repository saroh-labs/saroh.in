import { getJson } from "./control-plane";

/** The waitlist, as the console reads it (plan U11). Server-only. */

export interface WaitlistSummary {
    waiting: number;
    invited: number;
    joinedLastWeek: number;
    oldestWaitingDays: number;
    bySource: { source: string | null; count: number }[];
    /** U30: everyone still waiting by kind of business, and by city. */
    byKind: { kind: string | null; count: number }[];
    byCity: { city: string; count: number }[];
    /** Everyone still waiting by country, as saroh.in's host saw them; null: unknown. */
    byCountry: { country: string | null; count: number }[];
    /** U30: who sent the most people, across the whole list. */
    topReferrers: {
        id: string;
        businessName: string | null;
        email: string;
        referrals: number;
    }[];
    /** U31: invited people who made their business with the invite. */
    joined: number;
    /** False when invites can't go: no sign-up address or no launch offer. */
    canInvite: boolean;
    /** Why not, in the API's words; null when they can. */
    inviteBlocker: string | null;
}

export interface WaitlistRow {
    id: string;
    email: string;
    businessName: string | null;
    kind: string | null;
    city: string | null;
    /** Two letters, as saroh.in's host saw the connection; null before 5 Oct 2026. */
    country: string | null;
    plan: string | null;
    position: number;
    /** How many people joined through this entry's link. */
    referrals: number;
    source: string | null;
    createdAt: string;
    invitedAt: string | null;
    /** U31: when the invite email left; null while it is being sent. */
    inviteSentAt: string | null;
    /** U31: when they made their business with the invite. */
    joinedAt: string | null;
}

export function getWaitlistSummary(): Promise<WaitlistSummary | null> {
    return getJson<WaitlistSummary>("/waitlist/summary");
}

export function listWaitlist(params: {
    state?: string;
    source?: string;
    kind?: string;
    city?: string;
    country?: string;
    cursor?: string;
}): Promise<{ items: WaitlistRow[]; nextCursor?: string } | null> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params) as [
        string,
        string | undefined,
    ][]) {
        if (value) search.set(key, value);
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return getJson(`/waitlist${suffix}`);
}

/** The form's kinds of business (U30), as the console names them. */
export const WAITLIST_KIND_LABELS: Record<string, string> = {
    salon: "Salon or beauty",
    gym: "Gym or studio",
    clinic: "Clinic",
    coach: "Dietician or coach",
    food: "Bakery or food",
    shop: "Shop",
    creator: "Creator",
    other: "Something else",
};

export function kindLabel(kind: string | null): string {
    if (!kind) return "Not recorded";
    return WAITLIST_KIND_LABELS[kind] ?? kind;
}
