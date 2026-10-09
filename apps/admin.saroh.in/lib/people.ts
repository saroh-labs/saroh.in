import { getJson } from "./control-plane";

/** People across the instance, as the console reads them (plan U6). Server-only. */

export interface PersonRow {
    id: string;
    name: string | null;
    email: string;
    emailVerified: boolean;
    createdAt: string;
    businesses: number;
    lastSeenAt: string | null;
    isStaff: boolean;
}

export interface PersonDetail extends PersonRow {
    memberships: {
        organizationId: string;
        organizationName: string;
        organizationSlug: string;
        lifecycleStatus: string;
        role: string;
    }[];
    sessions: {
        id: string;
        createdAt: string;
        lastActiveAt: string;
        expiresAt: string;
        ipAddress: string | null;
        userAgent: string | null;
    }[];
}

/** One account in "Newest sign-ups". */
export interface RecentSignup {
    id: string;
    name: string | null;
    email: string;
    createdAt: string;
    businesses: { id: string; name: string }[];
}

/** The last 25 accounts created, newest first. Each read is recorded. */
export function recentSignups(): Promise<RecentSignup[] | null> {
    return getJson<RecentSignup[]>("/people/recent");
}

export function searchPeople(q: string): Promise<PersonRow[] | null> {
    return getJson<PersonRow[]>(`/people?q=${encodeURIComponent(q)}`);
}

export function getPerson(userId: string): Promise<PersonDetail | null> {
    return getJson<PersonDetail>(`/people/${encodeURIComponent(userId)}`);
}
