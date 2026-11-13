import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { overLimit } from "../billing/over-limit.service";
import type { OrgAction } from "./organization-actions";
import { resolveCapabilities } from "./organization-policy";

type Db = Pick<Prisma.TransactionClient, "membership" | "organizationRole">;

/** One person on the team, with what they may do there. */
export interface TeamPower {
    membershipId: string;
    userId: string;
    /** The role as stored: a built-in or a key the business made. */
    role: string;
    /** Their sign-in email, trimmed; "" when they have none. */
    email: string;
    /** The role's row plus their own extras, implied holds added (F17). */
    actions: ReadonlySet<OrgAction>;
}

/**
 * Everyone on the team with their resolved permissions, ordered by user:
 * who is told or emailed is asked of these, never of a role's name (owner,
 * 12 Nov 2026). `db` is a transaction when the caller has one.
 */
export async function teamPowers(
    organizationId: string,
    db: Db = prisma,
): Promise<TeamPower[]> {
    const [members, roles] = await Promise.all([
        db.membership.findMany({
            where: { organizationId },
            select: {
                id: true,
                userId: true,
                role: true,
                extraActions: true,
                user: { select: { email: true } },
            },
            orderBy: { userId: "asc" },
        }),
        db.organizationRole.findMany({
            where: { organizationId },
            select: { key: true, actions: true },
        }),
    ]);
    return members.map((m) => ({
        membershipId: m.id,
        userId: m.userId,
        role: m.role,
        email: m.user.email.trim(),
        actions: resolveCapabilities(
            m.role,
            roles.find((r) => r.key === m.role)?.actions ?? null,
            m.extraActions,
        ),
    }));
}

/**
 * {@link teamPowers}, less anyone who can't open the business now: a member
 * paused past the plan's limit (#800), as the organization context refuses
 * them. The owner is never paused (`member-paused.ts`).
 */
export async function activeTeam(
    organizationId: string,
    db: Db = prisma,
): Promise<TeamPower[]> {
    const [team, paused] = await Promise.all([
        teamPowers(organizationId, db),
        overLimit.pausedNow(organizationId),
    ]);
    return team.filter(
        (m) => m.role === "OWNER" || !paused?.memberIds.has(m.membershipId),
    );
}

/** The {@link activeTeam} who hold `action`. */
export async function teamHolding(
    organizationId: string,
    action: OrgAction,
    db: Db = prisma,
): Promise<TeamPower[]> {
    return (await activeTeam(organizationId, db)).filter((m) =>
        m.actions.has(action),
    );
}
