import { ConflictException, Injectable } from "@nestjs/common";
import type { Prisma, SearchPage } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import {
    AdminAuditOutcome,
    AdminAuditService,
} from "../admin/admin-audit.service";
import type { DeploymentRun } from "../admin/admin-deployments";
import { AdminPermission } from "../admin/admin-permissions";
import type { SearchPageAction, SearchPageStatus } from "./search-page-rules";
import { changesLive, nextStatus } from "./search-page-rules";
import {
    enqueueWebDeploy,
    pathsOf,
    SEARCH_PAGES_DEPLOY_TYPE,
} from "./search-pages-deploy.job";

export interface SearchPageView {
    path: string;
    /** What staff last chose (staged). */
    status: SearchPageStatus;
    /** What the last Deploy changes sent to the site. */
    releasedStatus: SearchPageStatus;
    liveSince: Date | null;
    changedAt: Date;
    changedBy: { name: string | null } | null;
    deployedAt: Date | null;
    deployedBy: { name: string | null } | null;
}

export interface RebuildView {
    running: boolean;
    startedAt?: Date | string;
    url?: string;
    /** The paths a deploy still waiting to start carries. */
    paths?: string[];
}

export interface SearchPageEventView {
    action: string;
    fromStatus: SearchPageStatus;
    toStatus: SearchPageStatus;
    by: { name: string | null } | null;
    at: Date;
}

const RUNNING_STATES = new Set(["queued", "waiting", "running"]);

/**
 * Search pages' publish records (DEC-193): which pages are live on this
 * environment's saroh.in, set by staff in the admin console. Publish,
 * unpublish, archive and restore only stage a change; Deploy changes sends
 * every staged change to the site in one rebuild (R13, owner 31 Oct). Each
 * is all or nothing in one transaction and writes a history row and an
 * admin audit entry per page. A path with no record reads as DRAFT and is
 * not listed.
 */
@Injectable()
export class SearchPagesService {
    constructor(private readonly audit: AdminAuditService) {}

    /**
     * Every page with a record, and whether a rebuild is under way: a deploy
     * queued here and not yet started, or the web app's newest run on GitHub
     * (`webRun`, from the console's Deployments read) still going.
     */
    async list(
        webRun: DeploymentRun | null,
    ): Promise<{ pages: SearchPageView[]; rebuild: RebuildView }> {
        const [rows, queued] = await Promise.all([
            prisma.searchPage.findMany({ orderBy: { path: "asc" } }),
            prisma.job.findFirst({
                where: {
                    type: SEARCH_PAGES_DEPLOY_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
                orderBy: { createdAt: "asc" },
                select: { createdAt: true, payload: true },
            }),
        ]);
        let rebuild: RebuildView = { running: false };
        if (queued) {
            rebuild = {
                running: true,
                startedAt: queued.createdAt,
                paths: pathsOf(queued.payload),
            };
        } else if (webRun && RUNNING_STATES.has(webRun.state)) {
            rebuild = {
                running: true,
                startedAt: webRun.startedAt,
                url: webRun.url,
            };
        }
        return { pages: await views(rows), rebuild };
    }

    /** Newest first. */
    async history(path: string): Promise<{ events: SearchPageEventView[] }> {
        const rows = await prisma.searchPageEvent.findMany({
            where: { path },
            orderBy: [{ at: "desc" }, { id: "desc" }],
        });
        const names = await namesOf(rows.map((r) => r.byUserId));
        return {
            events: rows.map((r) => ({
                action: r.action,
                fromStatus: r.fromStatus ?? "DRAFT",
                toStatus: r.toStatus,
                by: names.has(r.byUserId)
                    ? { name: names.get(r.byUserId) ?? null }
                    : null,
                at: r.at,
            })),
        };
    }

    /**
     * Stage one action on every path, or on none: any path the action can't
     * be done from where it is now is a 409 naming them all. Nothing
     * rebuilds; Deploy changes sends it to the site.
     */
    async act(
        staff: PlatformAdminInfo,
        action: SearchPageAction,
        paths: string[],
    ): Promise<{ pages: SearchPageView[] }> {
        const rows = await prisma.$transaction(async (tx) => {
            await lockPublishing(tx);
            const existing = new Map(
                (
                    await tx.searchPage.findMany({
                        where: { path: { in: paths } },
                    })
                ).map((r) => [r.path, r]),
            );
            const changes = paths.map((path) => {
                const row = existing.get(path);
                const from = row?.status ?? null;
                return { path, row, from, to: nextStatus(action, from) };
            });
            const refused = changes
                .filter((c) => c.to === null)
                .map((c) => c.path);
            if (refused.length > 0) {
                throw new ConflictException({
                    message: `These pages can't be ${PAST[action]} from where they are now: ${refused.join(", ")}. Nothing was changed.`,
                    details: { action, paths: refused },
                });
            }

            const now = new Date();
            const written: SearchPage[] = [];
            for (const { path, row, from, to } of changes) {
                if (!to) continue;
                const released = row?.releasedStatus ?? "DRAFT";
                const data = {
                    status: to,
                    // A change the site can't see (archiving a draft,
                    // taking off a page that never went out) is released
                    // at once, so staged and released differ only while
                    // a page waits to go on or come off.
                    releasedStatus: changesLive(released, to) ? released : to,
                    changedAt: now,
                    changedByUserId: staff.userId,
                };
                written.push(
                    await tx.searchPage.upsert({
                        where: { path },
                        create: { path, ...data },
                        update: data,
                    }),
                );
                await tx.searchPageEvent.create({
                    data: {
                        path,
                        action,
                        fromStatus: from,
                        toStatus: to,
                        byUserId: staff.userId,
                        at: now,
                    },
                });
                await this.audit.write(tx, {
                    actorUserId: staff.userId,
                    permission: AdminPermission.SearchPagesPublish,
                    action: `search-page.${action}`,
                    targetType: "search_page",
                    targetId: path,
                    outcome: AdminAuditOutcome.Success,
                    metadata: { from: from ?? "DRAFT", to },
                });
            }
            return written;
        });
        return { pages: await views(rows) };
    }

    /**
     * Deploy changes: every page waiting to go on or come off is released
     * at once, with a history row and an audit entry each, and ONE site
     * rebuild carries them all. A 409 when nothing is waiting. A rebuild
     * still waiting to start takes the new paths instead of a second one.
     */
    async deploy(
        staff: PlatformAdminInfo,
    ): Promise<{ paths: string[]; rebuildQueued: boolean }> {
        return prisma.$transaction(async (tx) => {
            await lockPublishing(tx);
            const waiting = (
                await tx.searchPage.findMany({ orderBy: { path: "asc" } })
            ).filter((r) => r.status !== r.releasedStatus);
            if (waiting.length === 0) {
                throw new ConflictException({
                    message: "Nothing is waiting to deploy.",
                });
            }
            const now = new Date();
            for (const row of waiting) {
                const wasOn = row.releasedStatus === "LIVE";
                const goesOn = row.status === "LIVE";
                await tx.searchPage.update({
                    where: { path: row.path },
                    data: {
                        releasedStatus: row.status,
                        liveSince: goesOn
                            ? wasOn
                                ? row.liveSince
                                : now
                            : null,
                        // A page taken off redirects on the site, so a
                        // restored page keeps this.
                        takenOffAt: wasOn && !goesOn ? now : row.takenOffAt,
                        deployedAt: now,
                        deployedByUserId: staff.userId,
                    },
                });
                await tx.searchPageEvent.create({
                    data: {
                        path: row.path,
                        action: "deploy",
                        fromStatus: row.releasedStatus,
                        toStatus: row.status,
                        byUserId: staff.userId,
                        at: now,
                    },
                });
                await this.audit.write(tx, {
                    actorUserId: staff.userId,
                    permission: AdminPermission.SearchPagesPublish,
                    action: "search-page.deploy",
                    targetType: "search_page",
                    targetId: row.path,
                    outcome: AdminAuditOutcome.Success,
                    metadata: { from: row.releasedStatus, to: row.status },
                });
            }
            const paths = waiting.map((r) => r.path);
            return { paths, rebuildQueued: await enqueueWebDeploy(tx, paths) };
        });
    }

    /**
     * For the site's build: what the last Deploy changes put on the site,
     * and what was on it and is no longer. Staged changes aren't in it.
     */
    async publicList(): Promise<{
        live: string[];
        takenOff: { path: string; at: Date }[];
    }> {
        const rows = await prisma.searchPage.findMany({
            where: {
                OR: [{ releasedStatus: "LIVE" }, { takenOffAt: { not: null } }],
            },
            orderBy: { path: "asc" },
            select: { path: true, releasedStatus: true, takenOffAt: true },
        });
        return {
            live: rows
                .filter((r) => r.releasedStatus === "LIVE")
                .map((r) => r.path),
            takenOff: rows.flatMap((r) =>
                r.releasedStatus !== "LIVE" && r.takenOffAt
                    ? [{ path: r.path, at: r.takenOffAt }]
                    : [],
            ),
        };
    }
}

/** One publish or deploy at a time, so two can't both read a path as new. */
async function lockPublishing(
    tx: Pick<Prisma.TransactionClient, "$executeRaw">,
): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"search-pages:publish"}))`;
}

const PAST: Record<SearchPageAction, string> = {
    publish: "published",
    unpublish: "unpublished",
    archive: "archived",
    restore: "restored",
};

async function namesOf(ids: string[]): Promise<Map<string, string | null>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const users = await prisma.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
}

async function views(rows: SearchPage[]): Promise<SearchPageView[]> {
    const names = await namesOf(
        rows.flatMap((r) =>
            [r.changedByUserId, r.deployedByUserId].filter(
                (id): id is string => id !== null,
            ),
        ),
    );
    const who = (id: string | null) =>
        id && names.has(id) ? { name: names.get(id) ?? null } : null;
    return rows.map((r) => ({
        path: r.path,
        status: r.status,
        releasedStatus: r.releasedStatus,
        liveSince: r.liveSince,
        changedAt: r.changedAt,
        changedBy: who(r.changedByUserId),
        deployedAt: r.deployedAt,
        deployedBy: who(r.deployedByUserId),
    }));
}
