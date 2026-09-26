import { getJson } from "./control-plane";

/** The waitlist, as the console reads it (plan U11). Server-only. */

export interface WaitlistSummary {
    waiting: number;
    invited: number;
    joinedLastWeek: number;
    oldestWaitingDays: number;
    bySource: { source: string | null; count: number }[];
    /** False when this instance does not know where people sign up. */
    canInvite: boolean;
}

export interface WaitlistRow {
    id: string;
    email: string;
    source: string | null;
    createdAt: string;
    invitedAt: string | null;
}

export function getWaitlistSummary(): Promise<WaitlistSummary | null> {
    return getJson<WaitlistSummary>("/waitlist/summary");
}

export function listWaitlist(params: {
    state?: string;
    source?: string;
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
