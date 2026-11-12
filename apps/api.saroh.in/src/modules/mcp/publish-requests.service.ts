import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { authorize } from "../organizations/organization-policy";
import { approvalApplies } from "../sites/publish-approval";
import { siteOriginOf } from "../sites/site-origin";
import { SitesService } from "../sites/sites.service";
import { TestReleasesService } from "../sites/test-releases.service";
import { siteTarget } from "./activity.service";
import type { PublishOutcome, PublishRequestRow } from "./publish-requests";
import {
    assertOpen,
    confirmPublishRequest,
    findPublishRequest,
    publishFingerprint,
    requestNotFound,
    statusOf,
    takeRequest,
    toReviewersOf,
} from "./publish-requests";

/** What the confirm screen shows (`GET …/publish-requests/:requestId`). */
export interface PublishRequestView {
    siteId: string;
    siteName: string;
    /** The AI app that asked, by the name it signed in with. */
    app: string;
    /** Whose connection it is; null when that person is gone. */
    connectedBy: string | null;
    requestedAt: string;
    expiresAt: string;
    status: ReturnType<typeof statusOf>;
    will: "go_live" | "go_to_reviewers";
    /** The draft, or the route, is no longer what the app prepared. */
    draftChanged: boolean;
    /** What publishing would change now, as the Publish sheet says it. */
    neverPublished: boolean;
    pendingChanges: number | null;
    pendingSiteChanges: string[] | null;
    decidedBy: string | null;
    decidedAt: string | null;
    /** The live address, once published. */
    liveUrl: string | null;
}

export interface PublishRequestAnswer {
    outcome: "published" | "sent_for_approval" | "declined";
    liveUrl: string | null;
}

/**
 * The person's side of an AI app's publish request (DEC-215 as amended
 * 12 Nov 2026): read it, confirm it, or decline it. Only someone with
 * `site:publish` in this business, signed in; whoever confirms, the click
 * is theirs, and it is audited as them, naming the app that prepared it.
 * Confirming publishes exactly as the Website screen's Publish does, or,
 * with "Publishing needs approval" in force, makes the approval request
 * (a test release put up for review) as the app's publish used to.
 */
@Injectable()
export class PublishRequestsService {
    private readonly logger = new Logger(PublishRequestsService.name);

    constructor(
        private readonly sites: SitesService,
        private readonly releases: TestReleasesService,
        private readonly audit: AuditService,
    ) {}

    private async load(
        ctx: OrganizationContext,
        siteId: string,
        token: string,
    ): Promise<PublishRequestRow> {
        authorize(ctx, "site:publish");
        const row = await findPublishRequest(ctx.organizationId, token);
        if (row?.siteId !== siteId) throw requestNotFound();
        return row;
    }

    private async toReviewers(ctx: OrganizationContext, siteId: string) {
        const site = await prisma.site.findFirst({
            where: {
                id: siteId,
                organizationId: ctx.organizationId,
                deletedAt: null,
            },
            select: { publishNeedsApproval: true },
        });
        if (!site) throw requestNotFound();
        return approvalApplies(ctx.organizationId, site.publishNeedsApproval);
    }

    async read(
        ctx: OrganizationContext,
        siteId: string,
        token: string,
        now = new Date(),
    ): Promise<PublishRequestView> {
        const row = await this.load(ctx, siteId, token);
        const site = await this.sites.getSite(ctx, siteId);
        const toReviewers = await this.toReviewers(ctx, siteId);
        const draft = await this.sites.loadDraftSite({
            id: siteId,
            organizationId: ctx.organizationId,
            deletedAt: null,
        });
        const people = await prisma.user.findMany({
            where: {
                id: {
                    in: [row.requestedByUserId, row.decidedByUserId].filter(
                        (id): id is string => id !== null,
                    ),
                },
            },
            select: { id: true, name: true, email: true },
        });
        const nameOf = (id: string | null) => {
            const user = people.find((p) => p.id === id);
            if (!user) return null;
            return user.name.trim() ? user.name : user.email;
        };
        const status = statusOf(row, now);
        return {
            siteId,
            siteName: site.name,
            app: row.clientName,
            connectedBy: nameOf(row.requestedByUserId),
            requestedAt: row.createdAt.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
            status,
            will: toReviewersOf(row.draftFingerprint)
                ? "go_to_reviewers"
                : "go_live",
            draftChanged:
                !draft ||
                publishFingerprint(toReviewers, draft) !== row.draftFingerprint,
            neverPublished: !site.currentPublicationId,
            pendingChanges: site.pendingSectionChanges ?? null,
            pendingSiteChanges: site.pendingSiteChanges ?? null,
            decidedBy: nameOf(row.decidedByUserId),
            decidedAt: row.usedAt?.toISOString() ?? null,
            liveUrl:
                status === "published"
                    ? await siteOriginOf(ctx.organizationId, { siteId })
                    : null,
        };
    }

    /**
     * Publish, or send to the reviewers, the draft the request described.
     * Checked again under the site's lock: the request still open, the
     * draft unchanged since the app prepared it.
     */
    async confirm(
        ctx: OrganizationContext,
        siteId: string,
        token: string,
        now = new Date(),
    ): Promise<PublishRequestAnswer> {
        const row = await this.load(ctx, siteId, token);
        assertOpen(row, now);
        const toReviewers = await this.toReviewers(ctx, siteId);
        const confirm = confirmPublishRequest(
            ctx.organizationId,
            row,
            ctx.userId,
            toReviewers,
            now,
            this.sites,
        );
        if (toReviewers) {
            const made = await this.releases.create(
                ctx,
                siteId,
                {},
                { confirm },
            );
            await this.sites.requestReview(ctx, siteId, made.release.id);
            await this.record(ctx, row, "SENT_FOR_APPROVAL");
            return { outcome: "sent_for_approval", liveUrl: null };
        }
        // Never `override`: going live past approval is an owner's call in
        // the editor, not from an app's request.
        await this.sites.publishSite(ctx, siteId, { confirm });
        await this.record(ctx, row, "PUBLISHED");
        return {
            outcome: "published",
            liveUrl: await siteOriginOf(ctx.organizationId, { siteId }),
        };
    }

    /** Nothing is published; the request is closed and its link says so. */
    async decline(
        ctx: OrganizationContext,
        siteId: string,
        token: string,
        now = new Date(),
    ): Promise<PublishRequestAnswer> {
        const row = await this.load(ctx, siteId, token);
        assertOpen(row, now);
        await takeRequest(prisma, row, ctx.userId, "DECLINED", now);
        await this.record(ctx, row, "DECLINED");
        return { outcome: "declined", liveUrl: null };
    }

    /**
     * On the connection's own change list (Settings › AI apps), as the
     * person, and in the audit trail. After the change: a failure here
     * never undoes it (the audit writer swallows its own).
     */
    private async record(
        ctx: OrganizationContext,
        row: PublishRequestRow,
        outcome: PublishOutcome,
    ) {
        const summary = {
            PUBLISHED:
                "Published the website in Saroh, as this app prepared it.",
            SENT_FOR_APPROVAL:
                "Sent the website to its reviewers from Saroh, as this app prepared it.",
            DECLINED: "Didn't publish the website this app prepared.",
        }[outcome];
        await prisma.mcpActivity
            .create({
                data: {
                    organizationId: ctx.organizationId,
                    userId: ctx.userId,
                    connectionId: row.connectionId,
                    clientName: row.clientName,
                    tool: "publish_request_answered",
                    target: siteTarget(row.siteId),
                    summary,
                },
            })
            .catch((error: unknown) => {
                // Degraded path: answered and audited, but not on the
                // connection's change list.
                this.logger.warn(
                    `mcp_activity_failed tool=publish_request_answered: ${error instanceof Error ? error.message : String(error)}`,
                );
            });
        await this.audit.record({
            action: AuditAction.AiPublishRequestAnswered,
            actorUserId: ctx.userId,
            actorRoleKey: ctx.roleKey,
            organizationId: ctx.organizationId,
            targetType: "ai_connection",
            targetId: row.connectionId,
            outcome: AuditOutcome.Success,
            metadata: {
                siteId: row.siteId,
                outcome,
                app: row.clientName,
                requestedBy: row.requestedByUserId,
            },
        });
    }
}
