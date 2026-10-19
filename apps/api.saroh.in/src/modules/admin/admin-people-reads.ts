import { prisma } from "@saroh/database";

import type { EmailVerifiedBy } from "../../common/auth/email-verification";
import { emailVerifiedBy } from "../../common/auth/email-verification";
import { holds } from "../../common/auth/sign-in-holds";
import { AdminAuditOutcome } from "./admin-audit.service";
import type { PeopleFilter } from "./sign-in-help-rules";
import {
    CODE_WINDOW_MS,
    CODES_PER_PERSON,
    SignInHelpAction,
} from "./sign-in-help-rules";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The `where` a set of chips and a search make. */
export function peopleWhere(
    q: string | undefined,
    filters: readonly PeopleFilter[],
    now: Date = new Date(),
) {
    const and: object[] = [];
    const term = q?.trim();
    if (term) {
        and.push({
            OR: [
                { id: term },
                { email: { contains: term, mode: "insensitive" } },
                { name: { contains: term, mode: "insensitive" } },
            ],
        });
    }
    for (const filter of new Set(filters)) {
        if (filter === "no-business") and.push({ memberships: { none: {} } });
        if (filter === "unverified") and.push({ emailVerified: false });
        if (filter === "owners") {
            and.push({ memberships: { some: { role: "OWNER" } } });
        }
        if (filter === "joined-this-week") {
            and.push({
                createdAt: { gte: new Date(now.getTime() - WEEK_MS) },
            });
        }
    }
    return and.length > 0 ? { AND: and } : {};
}

/**
 * Why a person can't sign in right now, if anything stands in the way, for
 * the user page's banner. In words on the console; codes here.
 *
 * - `held`: staff changed their sign-in email; no code and no session until
 *   the hold ends or a second staff member confirms;
 * - `unverified`: their email isn't verified, so a password is refused
 *   until they enter the code that sign-in emails them.
 */
export type SignInBlock = "held" | "unverified";

export interface SignInState {
    verifiedBy: EmailVerifiedBy;
    /** When staff marked the address verified, while that stands. */
    verifiedByStaffAt: Date | null;
    block: SignInBlock | null;
    /** The latest sign-in email change staff made, held or not. */
    lastChange: {
        id: string;
        oldEmail: string;
        newEmail: string;
        requestedByUserId: string;
        requestedByName: string | null;
        codeHeldUntil: Date;
        confirmedAt: Date | null;
        confirmedByUserId: string | null;
        codeSentAt: Date | null;
        createdAt: Date;
        held: boolean;
    } | null;
    /** Sign-in codes staff sent them in the last hour, against the limit. */
    codesThisHour: number;
    codesPerHour: number;
    lastCodeSentAt: Date | null;
}

/** The Sign-in tab's facts and the banner's reason. */
export async function signInState(
    user: {
        id: string;
        email: string;
        emailVerified: boolean;
        emailVerifiedByStaffAt: Date | null;
    },
    now: Date = new Date(),
): Promise<SignInState> {
    const [change, codes] = await Promise.all([
        prisma.signInEmailChange.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
        }),
        prisma.adminAuditEvent.findMany({
            where: {
                action: SignInHelpAction.CodeSent,
                outcome: AdminAuditOutcome.Success,
                targetType: "user",
                targetId: user.id,
            },
            select: { createdAt: true },
            orderBy: { createdAt: "desc" },
            take: CODES_PER_PERSON,
        }),
    ]);
    const held = holds(change, user.email, now);
    const requester = change
        ? await prisma.user.findUnique({
              where: { id: change.requestedByUserId },
              select: { name: true, email: true },
          })
        : null;
    const since = now.getTime() - CODE_WINDOW_MS;
    return {
        verifiedBy: emailVerifiedBy(user),
        verifiedByStaffAt: user.emailVerified
            ? user.emailVerifiedByStaffAt
            : null,
        block: held ? "held" : user.emailVerified ? null : "unverified",
        lastChange: change
            ? {
                  id: change.id,
                  oldEmail: change.oldEmail,
                  newEmail: change.newEmail,
                  requestedByUserId: change.requestedByUserId,
                  requestedByName: requester ? displayName(requester) : null,
                  codeHeldUntil: change.codeHeldUntil,
                  confirmedAt: change.confirmedAt,
                  confirmedByUserId: change.confirmedByUserId,
                  codeSentAt: change.codeSentAt,
                  createdAt: change.createdAt,
                  held,
              }
            : null,
        codesThisHour: codes.filter((c) => c.createdAt.getTime() > since)
            .length,
        codesPerHour: CODES_PER_PERSON,
        lastCodeSentAt: codes[0]?.createdAt ?? null,
    };
}

export interface PersonHistoryItem {
    id: string;
    action: string;
    outcome: string;
    reason: string | null;
    organizationId: string | null;
    actorUserId: string;
    /** The staff member's name, else email; null when the account is gone. */
    actorName: string | null;
    createdAt: Date;
}

/** How many ledger rows the History tab shows. */
export const HISTORY_LIMIT = 50;

/**
 * What staff did to this person, newest first: the admin ledger's writes
 * about their account and their place in businesses. Reads of their page
 * are left out; they are on the full audit trail.
 */
export async function personHistory(
    userId: string,
): Promise<PersonHistoryItem[]> {
    const rows = await prisma.adminAuditEvent.findMany({
        where: {
            targetId: userId,
            targetType: { in: ["user", "membership"] },
            action: { notIn: ["person.read", "person.history.read"] },
        },
        select: {
            id: true,
            action: true,
            outcome: true,
            reason: true,
            organizationId: true,
            actorUserId: true,
            createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: HISTORY_LIMIT,
    });
    const actorIds = [...new Set(rows.map((row) => row.actorUserId))];
    const actors = await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
    });
    const nameOf = new Map(
        actors.map((actor) => [actor.id, displayName(actor)]),
    );
    return rows.map((row) => ({
        ...row,
        actorName: nameOf.get(row.actorUserId) ?? null,
    }));
}

/** One person on the Users list. */
export interface PersonRow {
    id: string;
    name: string | null;
    email: string;
    emailVerified: boolean;
    /** "self", "staff" (Mark verified) or null when not verified. */
    verifiedBy: EmailVerifiedBy;
    createdAt: Date;
    businesses: number;
    /** Owns at least one business. */
    isOwner: boolean;
    lastSeenAt: Date | null;
    isStaff: boolean;
}

export const personSelect = {
    id: true,
    name: true,
    email: true,
    emailVerified: true,
    emailVerifiedByStaffAt: true,
    createdAt: true,
    _count: { select: { memberships: true } },
    // Enough to say whether they own a business; the detail read selects
    // every membership under the same key.
    memberships: {
        where: { role: "OWNER" },
        select: { role: true },
        take: 1,
    },
    platformAdmin: { select: { revokedAt: true } },
} as const;

export interface PersonRecord {
    id: string;
    name: string | null;
    email: string;
    emailVerified: boolean;
    emailVerifiedByStaffAt: Date | null;
    createdAt: Date;
    _count: { memberships: number };
    memberships: { role: string }[];
    platformAdmin: { revokedAt: Date | null } | null;
}

/** A list row from a {@link personSelect} read. */
export async function personRow(user: PersonRecord): Promise<PersonRow> {
    const lastSession = await prisma.session.findFirst({
        where: { userId: user.id },
        select: { updatedAt: true },
        orderBy: { updatedAt: "desc" },
    });
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        verifiedBy: emailVerifiedBy(user),
        createdAt: user.createdAt,
        businesses: user._count.memberships,
        isOwner: user.memberships.some((row) => row.role === "OWNER"),
        lastSeenAt: lastSession?.updatedAt ?? null,
        isStaff: user.platformAdmin?.revokedAt === null,
    };
}

/** A name, else the email: Better Auth stores a missing name as "". */
function displayName(user: { name: string | null; email: string }): string {
    const name = user.name?.trim() ?? "";
    return name.length > 0 ? name : user.email;
}
