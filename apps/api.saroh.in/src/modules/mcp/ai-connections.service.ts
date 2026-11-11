import {
    ConflictException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type {
    AiConnectionActivity,
    AiConnectionActivityQuery,
    AiConnectionRollback,
} from "@saroh/api-contract";
import type { OauthConsent } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { allows, authorize } from "../organizations/organization-policy";
import { assertSiteInOrg } from "../sites/site-access";
import type { McpCall } from "./activity.service";
import { isKnownClient } from "./ai-apps";
import { RestorePointService } from "./restore-point.service";
import {
    changedOutside,
    restoreSnapshot,
    revisionsTarget,
    sessionPoint,
} from "./tools/site.tools";

/** A page of a connection's changes, unless asked for fewer. */
const CHANGES_PAGE = 20;

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
    constructor(
        private readonly audit: AuditService,
        @Optional()
        private readonly restorePoints: RestorePointService = new RestorePointService(),
    ) {}

    /**
     * What one connection changed in this business, newest first, paged by
     * the last row's id; on the first page, also each website draft it
     * changed and the point a roll back returns it to. The person's own, or
     * anyone's with `apikey:manage`.
     */
    async activity(
        ctx: OrganizationContext,
        id: string,
        query: AiConnectionActivityQuery = {},
    ): Promise<AiConnectionActivity> {
        const grant = await this.grantFor(ctx, id);
        const take = query.limit ?? CHANGES_PAGE;
        const where = {
            organizationId: ctx.organizationId,
            connectionId: grant.id,
        };
        const rows = await prisma.mcpActivity.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: take + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            select: { id: true, tool: true, summary: true, createdAt: true },
        });
        const page = rows.slice(0, take);
        return {
            data: page.map((r) => ({
                id: r.id,
                tool: r.tool,
                summary: r.summary,
                at: r.createdAt.toISOString(),
            })),
            nextCursor: rows.length > take ? page[page.length - 1].id : null,
            siteDrafts: query.cursor ? [] : await this.siteDrafts(where),
        };
    }

    /**
     * Puts a website's draft back to the restore point this connection's
     * latest session took, exactly as the assistant's own
     * `restore_site_draft` does: the live site is never touched. Refused
     * when the draft was also changed outside the connection since, so
     * nobody's other work is lost from here. The person's own, or anyone's
     * with `apikey:manage`; either way it needs the right to edit the site.
     */
    async rollBack(
        ctx: OrganizationContext,
        id: string,
        siteId: string,
    ): Promise<AiConnectionRollback> {
        const grant = await this.grantFor(ctx, id);
        authorize(ctx, "section:write");
        await assertSiteInOrg(ctx, siteId);
        const call: McpCall = {
            ctx,
            connection: {
                kind: "oauth",
                id: grant.id,
                clientId: grant.clientId,
                clientName: null,
                scopes: grant.scopes,
                userId: grant.userId ?? ctx.userId,
                businesses: [ctx.organizationId],
            },
        };
        if (!(await this.restorePoints.latest(call, siteId))) {
            throw new NotFoundException(
                "This assistant hasn't changed this website, so there's nothing to roll back.",
            );
        }
        const point = await sessionPoint(
            { restorePoints: this.restorePoints },
            call,
            siteId,
        );
        const outside = await changedOutside(call, siteId, point);
        if (outside.length > 0) {
            throw new ConflictException({
                message: `The draft was also changed outside this assistant since then (${outside.join(", ")}). Rolling back would undo that too, so it wasn't rolled back. Use the website editor's history instead.`,
                details: { changedOutside: outside },
            });
        }
        // As the tool does: the draft as it is now becomes a restore point,
        // so this roll back can itself be undone.
        await this.restorePoints.beforeSiteWrite(call, siteId);
        const result = await restoreSnapshot(ctx, siteId, point.snapshot);
        const restoredTo = point.sessionStartedAt.toISOString();
        const app = await prisma.oauthClient.findUnique({
            where: { clientId: grant.clientId },
            select: { name: true },
        });
        // On the connection's own list, with the revisions it left, so the
        // assistant's next restore counts this as its own.
        await prisma.mcpActivity.create({
            data: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                connectionId: grant.id,
                clientName: app?.name ?? "AI app",
                tool: "rollback_from_settings",
                target: revisionsTarget(siteId, result.revisions),
                summary: "Rolled the website draft back from Settings.",
            },
        });
        await this.audit.record({
            action: AuditAction.AiConnectionSiteRolledBack,
            actorUserId: ctx.userId,
            actorRoleKey: ctx.roleKey,
            organizationId: ctx.organizationId,
            targetType: "ai-connection",
            targetId: grant.id,
            outcome: AuditOutcome.Success,
            metadata: { siteId, restoredTo, of: grant.userId },
        });
        return { siteId, restoredTo };
    }

    /** The connection, if it reaches this business and the viewer may see it. */
    private async grantFor(ctx: OrganizationContext, id: string) {
        const grant = await prisma.oauthConsent.findFirst({
            where: { id, organizationIds: { has: ctx.organizationId } },
        });
        if (!grant)
            throw new NotFoundException("That connection isn't here any more.");
        if (grant.userId !== ctx.userId) authorize(ctx, "apikey:manage");
        return grant;
    }

    /** Each site the connection changed, with its latest session's start. */
    private async siteDrafts(where: {
        organizationId: string;
        connectionId: string;
    }) {
        const points = await prisma.siteRestorePoint.findMany({
            where: { ...where, site: { deletedAt: null } },
            orderBy: { createdAt: "desc" },
            distinct: ["siteId"],
            select: {
                siteId: true,
                sessionStartedAt: true,
                site: { select: { name: true } },
            },
        });
        return points.map((p) => ({
            siteId: p.siteId,
            siteName: p.site.name,
            since: p.sessionStartedAt.toISOString(),
        }));
    }

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
        const grant = await this.grantFor(ctx, id);
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
