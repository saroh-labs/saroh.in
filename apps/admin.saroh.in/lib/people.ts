import { cache } from "react";

import { getJson } from "./control-plane";
import type { UserChip } from "./user-filters";

/** People across the instance, as the console reads them (plan U6, U9). Server-only. */

export interface PersonRow {
    id: string;
    name: string | null;
    email: string;
    emailVerified: boolean;
    /** "self": by their own code; "staff": Mark verified; null: not verified. */
    verifiedBy: "self" | "staff" | null;
    createdAt: string;
    businesses: number;
    /** Owns at least one business. */
    isOwner: boolean;
    lastSeenAt: string | null;
    isStaff: boolean;
}

/** Why they can't sign in right now, if anything stops them. */
export type SignInBlock = "held" | "unverified";

export interface SignInState {
    verifiedBy: "self" | "staff" | null;
    verifiedByStaffAt: string | null;
    block: SignInBlock | null;
    /** The latest sign-in email change staff made, held or not. */
    lastChange: {
        id: string;
        oldEmail: string;
        newEmail: string;
        requestedByUserId: string;
        requestedByName: string | null;
        codeHeldUntil: string;
        confirmedAt: string | null;
        confirmedByUserId: string | null;
        codeSentAt: string | null;
        createdAt: string;
        held: boolean;
    } | null;
    codesThisHour: number;
    codesPerHour: number;
    lastCodeSentAt: string | null;
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
    signIn: SignInState;
}

/** One line of the History tab: something staff did to this person. */
export interface PersonHistoryItem {
    id: string;
    action: string;
    outcome: "SUCCESS" | "FAILURE" | "DENIED";
    reason: string | null;
    organizationId: string | null;
    actorUserId: string;
    actorName: string | null;
    createdAt: string;
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

/**
 * The Users list: a search (two characters or more), the chips, both or
 * neither (the newest accounts). Each read is recorded.
 */
export function listPeople(input: {
    q?: string;
    chips?: readonly UserChip[];
}): Promise<PersonRow[] | null> {
    const search = new URLSearchParams();
    if (input.q) search.set("q", input.q);
    if (input.chips && input.chips.length > 0) {
        search.set("filter", input.chips.join(","));
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return getJson<PersonRow[]>(`/people${suffix}`);
}

/**
 * One person. Cached for the request, so the user page's layout and its tab
 * read once (and the read is recorded once).
 */
export const getPerson = cache((userId: string): Promise<PersonDetail | null> =>
    getJson<PersonDetail>(`/people/${encodeURIComponent(userId)}`),
);

/** What staff did to this person, newest first. */
export function getPersonHistory(
    userId: string,
): Promise<PersonHistoryItem[] | null> {
    return getJson<PersonHistoryItem[]>(
        `/people/${encodeURIComponent(userId)}/history`,
    );
}
