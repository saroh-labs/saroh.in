import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "./organization-policy";
import {
    STOREFRONT_JOIN_AUDIT_ACTION,
    STOREFRONT_TEAM_ROLE_KEY,
} from "./storefront-team-role";

/** One person the backfill put on the team, as the notice names them. */
export interface StorefrontTeamNoticePerson {
    userId: string;
    name: string | null;
    email: string;
    /** The storefronts they work on in this business, by name. */
    storefronts: string[];
}

export interface StorefrontTeamNotice {
    people: StorefrontTeamNoticePerson[];
}

/**
 * Team's one-time notice after the F16 backfill (DEC-048, amended
 * 2026-09-27): "3 people from your storefronts are now on your team as
 * Storefront team", each with Change role, so any widening afterwards is on
 * purpose.
 *
 * Who it names comes from the backfill's own Activity entries, not from a
 * list stored beside them: the people it added since the notice was last
 * dismissed who still hold Storefront team. Someone moved to another role —
 * their role "looked at" — drops off, and when nobody is left the notice has
 * nothing to say. Dismissal is per business and on the server, not in one
 * browser.
 *
 * Only for whoever can act on it: `member:role:update`, Owners and Admins by
 * default. Anyone else is refused, as the Change role it offers would be.
 */
@Injectable()
export class StorefrontTeamNoticeService {
    async read(ctx: OrganizationContext): Promise<StorefrontTeamNotice> {
        authorize(ctx, "member:role:update");
        const organizationId = ctx.organizationId;

        const org = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { storefrontTeamNoticeDismissedAt: true },
        });
        const since = org?.storefrontTeamNoticeDismissedAt ?? null;

        const joins = await prisma.auditEvent.findMany({
            where: {
                organizationId,
                action: STOREFRONT_JOIN_AUDIT_ACTION,
                targetType: "membership",
                metadata: { path: ["source"], equals: "backfill" },
                ...(since ? { createdAt: { gt: since } } : {}),
            },
            select: { targetId: true },
        });
        const userIds = [
            ...new Set(
                joins
                    .map((j) => j.targetId)
                    .filter((id): id is string => Boolean(id)),
            ),
        ];
        if (userIds.length === 0) return { people: [] };

        const [memberships, storefrontRoles] = await Promise.all([
            prisma.membership.findMany({
                where: {
                    organizationId,
                    userId: { in: userIds },
                    role: STOREFRONT_TEAM_ROLE_KEY,
                },
                select: {
                    userId: true,
                    user: { select: { name: true, email: true } },
                },
                orderBy: { user: { email: "asc" } },
            }),
            prisma.storeMembers.findMany({
                where: {
                    userId: { in: userIds },
                    store: { organizationId, deletedAt: null },
                },
                orderBy: { createdAt: "asc" },
                select: { userId: true, store: { select: { name: true } } },
            }),
        ]);

        const storefronts = new Map<string, string[]>();
        for (const s of storefrontRoles) {
            storefronts.set(s.userId, [
                ...(storefronts.get(s.userId) ?? []),
                s.store.name,
            ]);
        }
        return {
            people: memberships.map((m) => ({
                userId: m.userId,
                name: m.user.name,
                email: m.user.email,
                storefronts: storefronts.get(m.userId) ?? [],
            })),
        };
    }

    /** Dismiss it for the business. Only people added later bring it back. */
    async dismiss(ctx: OrganizationContext): Promise<{ dismissed: true }> {
        authorize(ctx, "member:role:update");
        await prisma.organization.update({
            where: { id: ctx.organizationId },
            data: { storefrontTeamNoticeDismissedAt: new Date() },
        });
        return { dismissed: true };
    }
}
