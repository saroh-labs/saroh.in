import type { Prisma } from "@saroh/database";

import { AdminAuditOutcome, createAdminAuditData } from "./admin-audit.service";
import { AdminPermission, AdminRole } from "./admin-permissions";

/**
 * Ending account-manager links (DEC-169, admin console U25): what staff
 * writes and the sweep share.
 *
 * A link (`AccountManagerLink`, U19) lasts only while its manager holds the
 * Account manager role. It ends when:
 *
 * - their staff access is revoked (`AdminStaffService.revoke`, at once);
 * - an amend takes the role away (`AdminStaffService.amend`, at once);
 * - the role's assignment expires, or anything above slipped past
 *   (`manager-link-sweep.job.ts`, ended at the moment the role ended).
 *
 * The link is append-only: ending sets `endedAt`, `endedByUserId` and
 * `endedReason` on an open link and nothing else (the U19 trigger). Every
 * end is on the admin ledger against the business, so its History says so.
 */

type Tx = Prisma.TransactionClient;

/** Why a link ended without staff choosing to end it. */
export const LINK_END_CAUSES = [
    "ACCESS_REVOKED",
    "ROLE_REMOVED",
    "ROLE_EXPIRED",
    "LEFT_TEAM",
] as const;
export type LinkEndCause = (typeof LINK_END_CAUSES)[number];

/** What the link's `endedReason` says for each cause, in plain words. */
export const LINK_END_WORDS: Readonly<Record<LinkEndCause, string>> = {
    ACCESS_REVOKED: "Their staff access was taken away.",
    ROLE_REMOVED: "They no longer hold the Account manager role.",
    ROLE_EXPIRED: "Their Account manager role ran out.",
    LEFT_TEAM: "They are no longer on Saroh's team.",
};

/** The ledger's action for a link that ended (by staff or by the sweep). */
export const MANAGER_ENDED_ACTION = "account-manager.ended";

/** Who the ledger says ended a link the sweep found: the job, never a person. */
export const MANAGER_LINK_SWEEP_ACTOR = "system:manager-link-sweep";

/** An Account manager role assignment in force at `now`. */
export function activeManagerRole(
    now: Date,
): Prisma.PlatformAdminRoleAssignmentWhereInput {
    return {
        role: AdminRole.AccountManager,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
}

/** A teammate who holds the Account manager role at `now`. */
export function activeManagerWhere(now: Date): Prisma.PlatformAdminWhereInput {
    return {
        revokedAt: null,
        roleAssignments: { some: activeManagerRole(now) },
    };
}

export interface RoleHistory {
    /** The grant's own revocation; null while it stands. */
    grantRevokedAt: Date | null;
    /** Every Account manager assignment they ever had. */
    assignments: { revokedAt: Date | null; expiresAt: Date | null }[];
}

/**
 * When someone stopped holding the Account manager role, and why, from
 * their grant and assignments; null while they still hold it at `now`.
 *
 * The role ended at the latest moment any assignment was still in force
 * (each ends at its revocation or expiry, whichever came first), or when
 * the grant was revoked if that came earlier. Pure, so the sweep's rule is
 * tested without a database.
 */
export function roleEnded(
    history: RoleHistory | null,
    now: Date,
): { at: Date; cause: LinkEndCause } | null {
    if (!history) return { at: now, cause: "LEFT_TEAM" };
    const ends = history.assignments.map(
        (a): { at: number; cause: LinkEndCause } => {
            const revoked = a.revokedAt?.getTime() ?? Infinity;
            const expires = a.expiresAt?.getTime() ?? Infinity;
            return {
                at: Math.min(revoked, expires),
                cause: revoked <= expires ? "ROLE_REMOVED" : "ROLE_EXPIRED",
            };
        },
    );
    const latest = ends.reduce<{ at: number; cause: LinkEndCause } | null>(
        (best, end) => (best === null || end.at > best.at ? end : best),
        null,
    );
    const grantEnd = history.grantRevokedAt?.getTime() ?? Infinity;
    const roleEnd = latest?.at ?? -Infinity;
    if (grantEnd === Infinity && roleEnd > now.getTime()) return null;
    if (grantEnd <= roleEnd || (grantEnd !== Infinity && latest === null)) {
        return {
            at: new Date(Math.min(grantEnd, now.getTime())),
            cause: "ACCESS_REVOKED",
        };
    }
    if (latest === null) return { at: now, cause: "ROLE_REMOVED" };
    return {
        at: new Date(Math.min(roleEnd, now.getTime())),
        cause: latest.cause,
    };
}

export interface EndedLink {
    linkId: string;
    organizationId: string;
    kind: string;
}

/**
 * End every open link naming `platformAdminId`, inside the caller's
 * transaction, with one ledger row per business. A link that started after
 * `endedAt` (it can't, but the CHECK would refuse it) ends as it started.
 * Only open links are touched (`endedAt: null` in the write's own filter),
 * so a link ended a moment ago by someone else is left alone.
 */
export async function endManagerLinksInTx(
    tx: Tx,
    input: {
        platformAdminId: string;
        endedAt: Date;
        cause: LinkEndCause;
        /** The staff member who ended them; null for the sweep. */
        endedByUserId: string | null;
        /** Whose name the ledger rows carry: staff, or the sweep. */
        actorUserId: string;
        /** The staff member's own reason, when a person did it. */
        staffReason?: string;
    },
): Promise<EndedLink[]> {
    const open = await tx.accountManagerLink.findMany({
        where: { platformAdminId: input.platformAdminId, endedAt: null },
        select: { id: true, organizationId: true, kind: true, startedAt: true },
        orderBy: { startedAt: "asc" },
    });
    const words = LINK_END_WORDS[input.cause];
    const ended: EndedLink[] = [];
    for (const link of open) {
        const at =
            link.startedAt > input.endedAt ? link.startedAt : input.endedAt;
        const { count } = await tx.accountManagerLink.updateMany({
            where: { id: link.id, endedAt: null },
            data: {
                endedAt: at,
                endedByUserId: input.endedByUserId,
                endedReason: words,
            },
        });
        if (count === 0) continue;
        await tx.adminAuditEvent.create({
            data: createAdminAuditData({
                actorUserId: input.actorUserId,
                permission: AdminPermission.AccountsAssign,
                action: MANAGER_ENDED_ACTION,
                targetType: "organization",
                targetId: link.organizationId,
                organizationId: link.organizationId,
                reason: input.staffReason ?? words,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    linkId: link.id,
                    platformAdminId: input.platformAdminId,
                    kind: link.kind,
                    cause: input.cause,
                    endedAt: at.toISOString(),
                },
            }),
        });
        ended.push({
            linkId: link.id,
            organizationId: link.organizationId,
            kind: link.kind,
        });
    }
    return ended;
}
