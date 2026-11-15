import { Injectable } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { McpCall } from "./activity.service";
import { siteTarget } from "./activity.service";

/** Site writes this far apart, or further, start a new session. */
export const SESSION_GAP_MS = 30 * 60 * 1000;

/** A page as a restore point keeps it: its place and its latest draft. */
export interface RestorePage {
    pageId: string;
    path: string;
    title: string;
    isHome: boolean;
    hidden: boolean;
    inMenu: boolean;
    kind: string;
    /** The draft's revision then: a later one means it changed since. */
    revision: number;
    sections: {
        type: string;
        contractVersion: number;
        content: Prisma.JsonValue;
        hidden: boolean;
        key: string;
    }[];
}

/** `SiteRestorePoint.snapshot`: the site's draft when the session began. */
export interface RestoreSnapshot {
    style: Prisma.JsonValue | null;
    navigation: Prisma.JsonValue | null;
    footer: Prisma.JsonValue | null;
    seoTitle: string | null;
    seoDescription: string | null;
    pages: RestorePage[];
}

/**
 * Restore points for AI edits to a site (plan 2026-11-10-001, U10/U11). A
 * session is one connection's site writes less than {@link SESSION_GAP_MS}
 * apart; the first write of a session keeps the site's draft as it was, so
 * "undo what the AI did" has somewhere to go back to.
 *
 * Site write tools call {@link beforeSiteWrite} first, and record their
 * activity with target {@link siteTarget} (`site:<id>`), which is what the
 * next write measures the gap from.
 */
@Injectable()
export class RestorePointService {
    /**
     * Takes a restore point when this is the first write to `siteId` in this
     * connection's session; else nothing. Returns the point taken, or null.
     * Runs inside the tool's org context.
     */
    async beforeSiteWrite(
        { ctx, connection }: McpCall,
        siteId: string,
        now: Date = new Date(),
    ): Promise<{ id: string } | null> {
        const since = new Date(now.getTime() - SESSION_GAP_MS);
        const [write, point] = await Promise.all([
            prisma.mcpActivity.findFirst({
                where: {
                    organizationId: ctx.organizationId,
                    connectionId: connection.id,
                    target: { startsWith: siteTarget(siteId) },
                    createdAt: { gt: since },
                },
                select: { id: true },
            }),
            prisma.siteRestorePoint.findFirst({
                where: {
                    organizationId: ctx.organizationId,
                    siteId,
                    connectionId: connection.id,
                    createdAt: { gt: since },
                },
                select: { id: true },
            }),
        ]);
        if (write || point) return null;
        const snapshot = await this.snapshotOf(ctx.organizationId, siteId);
        if (!snapshot) return null;
        return prisma.siteRestorePoint.create({
            data: {
                organizationId: ctx.organizationId,
                siteId,
                connectionId: connection.id,
                sessionStartedAt: now,
                snapshot: snapshot as unknown as Prisma.InputJsonValue,
            },
            select: { id: true },
        });
    }

    /** This connection's latest restore point for a site, or null. */
    async latest({ ctx, connection }: McpCall, siteId: string) {
        const row = await prisma.siteRestorePoint.findFirst({
            where: {
                organizationId: ctx.organizationId,
                siteId,
                connectionId: connection.id,
            },
            orderBy: { createdAt: "desc" },
            select: { id: true, sessionStartedAt: true, snapshot: true },
        });
        return row
            ? { ...row, snapshot: row.snapshot as unknown as RestoreSnapshot }
            : null;
    }

    /** The site's draft now, or null when it isn't this business's. */
    private async snapshotOf(
        organizationId: string,
        siteId: string,
    ): Promise<RestoreSnapshot | null> {
        const site = await prisma.site.findFirst({
            where: { id: siteId, organizationId, deletedAt: null },
            select: {
                style: true,
                navigation: true,
                footer: true,
                seoTitle: true,
                seoDescription: true,
                pages: {
                    orderBy: { createdAt: "asc" },
                    select: {
                        id: true,
                        path: true,
                        title: true,
                        isHome: true,
                        hidden: true,
                        inMenu: true,
                        kind: true,
                        versions: {
                            where: { status: "DRAFT" },
                            orderBy: { createdAt: "desc" },
                            take: 1,
                            select: {
                                revision: true,
                                sections: {
                                    orderBy: { order: "asc" },
                                    select: {
                                        type: true,
                                        contractVersion: true,
                                        content: true,
                                        hidden: true,
                                        key: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!site) return null;
        return {
            style: site.style,
            navigation: site.navigation,
            footer: site.footer,
            seoTitle: site.seoTitle,
            seoDescription: site.seoDescription,
            pages: site.pages.map(({ id, versions, ...page }) => ({
                pageId: id,
                ...page,
                revision: versions[0]?.revision ?? 0,
                sections: versions[0]?.sections ?? [],
            })),
        };
    }
}
