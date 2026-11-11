import { Injectable, NotFoundException } from "@nestjs/common";
import type { OauthConsent } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { allows, authorize } from "../organizations/organization-policy";
import { isKnownClient } from "./ai-apps";

/** The actor of a connection Saroh ended by itself (idle). */
export const AI_CONNECTIONS_ACTOR = "system:ai-connections";

export interface AiConnectionView {
    id: string;
    app: { name: string | null; known: boolean };
    person: { id: string; name: string | null };
    scopes: string[];
    /** How many other businesses the same connection reaches (a count, so no other business's name leaks). */
    otherBusinesses: number;
    connectedAt: string | null;
    lastUsedAt: string | null;
}

/**
 * The business's AI connections (U9): each a person's sign-in grant to an AI
 * app that reaches this business (`OauthConsent` whose `organizationIds`
 * holds it; one grant may reach several, and shows under each). Everyone
 * sees their own; whoever holds `apikey:manage` (the Owner) sees and ends
 * everyone's. Ending one here takes only this business off the grant; the
 * grant itself ends when no business is left on it.
 */
@Injectable()
export class AiConnectionsService {
    constructor(private readonly audit: AuditService) {}

    async list(ctx: OrganizationContext): Promise<AiConnectionView[]> {
        const grants = await prisma.oauthConsent.findMany({
            where: {
                organizationIds: { has: ctx.organizationId },
                ...(allows(ctx, "apikey:manage") ? {} : { userId: ctx.userId }),
            },
            orderBy: { createdAt: "desc" },
        });
        if (grants.length === 0) return [];
        const [clients, people] = await Promise.all([
            prisma.oauthClient.findMany({
                where: {
                    clientId: {
                        in: [...new Set(grants.map((g) => g.clientId))],
                    },
                },
                select: { clientId: true, name: true },
            }),
            prisma.user.findMany({
                where: {
                    id: {
                        in: grants.flatMap((g) => (g.userId ? [g.userId] : [])),
                    },
                },
                select: { id: true, name: true },
            }),
        ]);
        const nameOf = new Map(clients.map((c) => [c.clientId, c.name]));
        const personOf = new Map(people.map((p) => [p.id, p.name]));
        return grants.map((g) => ({
            id: g.id,
            app: {
                name: nameOf.get(g.clientId) ?? null,
                known: isKnownClient(g.clientId),
            },
            person: {
                id: g.userId ?? "",
                name: personOf.get(g.userId ?? "") ?? null,
            },
            scopes: g.scopes,
            otherBusinesses: g.organizationIds.filter(
                (id) => id !== ctx.organizationId,
            ).length,
            connectedAt: g.createdAt?.toISOString() ?? null,
            lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
        }));
    }

    /**
     * Take this business off a connection: someone else's needs
     * `apikey:manage`. The app keeps its other businesses; with none left,
     * the connection ends ({@link endConnection}).
     */
    async disconnect(ctx: OrganizationContext, id: string): Promise<void> {
        const grant = await prisma.oauthConsent.findFirst({
            where: { id, organizationIds: { has: ctx.organizationId } },
        });
        if (!grant)
            throw new NotFoundException("That connection isn't here any more.");
        if (grant.userId !== ctx.userId) authorize(ctx, "apikey:manage");
        const left = grant.organizationIds.filter(
            (o) => o !== ctx.organizationId,
        );
        if (left.length === 0) {
            await endConnection(grant);
        } else {
            await prisma.oauthConsent.update({
                where: { id: grant.id },
                data: { organizationIds: left },
            });
        }
        await this.recordEnded(
            grant,
            ctx.userId,
            "person",
            ctx.roleKey,
            ctx.organizationId,
        );
    }

    /** On each business the grant reaches. */
    async recordConnected(grant: OauthConsent, appName: string | null) {
        if (!grant.userId) return;
        for (const organizationId of grant.organizationIds) {
            await this.audit.record({
                action: AuditAction.AiConnectionConnected,
                actorUserId: grant.userId,
                organizationId,
                targetType: "ai-connection",
                targetId: grant.id,
                outcome: AuditOutcome.Success,
                metadata: {
                    app: appName,
                    known: isKnownClient(grant.clientId),
                    scopes: grant.scopes,
                },
            });
        }
    }

    /** On `only`, or on every business the grant reached. */
    async recordEnded(
        grant: OauthConsent,
        actorUserId: string,
        reason: "person" | "idle",
        actorRoleKey?: string,
        only?: string,
    ) {
        const businesses = only ? [only] : grant.organizationIds;
        if (businesses.length === 0) return;
        const app = await prisma.oauthClient.findUnique({
            where: { clientId: grant.clientId },
            select: { name: true },
        });
        for (const organizationId of businesses) {
            await this.audit.record({
                action: AuditAction.AiConnectionDisconnected,
                actorUserId,
                organizationId,
                targetType: "ai-connection",
                targetId: grant.id,
                outcome: AuditOutcome.Success,
                metadata: { app: app?.name ?? null, of: grant.userId, reason },
                actorRoleKey,
            });
        }
    }
}

/**
 * Ends a connection: the grant goes, and with it every refresh token for
 * that person, app and business set (Better Auth revokes nothing when a consent
 * is deleted). A still-unexpired access token is then refused by
 * `McpAuthGuard`, which finds no grant.
 */
export async function endConnection(
    grant: Pick<OauthConsent, "id" | "clientId" | "userId" | "referenceId">,
): Promise<void> {
    const now = new Date();
    const same = {
        clientId: grant.clientId,
        userId: grant.userId ?? "",
        referenceId: grant.referenceId,
    };
    await prisma.$transaction([
        prisma.oauthConsent.deleteMany({ where: { id: grant.id } }),
        prisma.oauthRefreshToken.updateMany({
            where: { ...same, revoked: null },
            data: { revoked: now },
        }),
        prisma.oauthAccessToken.updateMany({
            where: { ...same, revoked: null },
            data: { revoked: now },
        }),
    ]);
}
