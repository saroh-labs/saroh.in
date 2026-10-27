import { ConflictException, Injectable } from "@nestjs/common";
import type { SearchPage } from "@saroh/database";
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
    SEARCH_PAGES_DEPLOY_TYPE,
} from "./search-pages-deploy.job";

export interface SearchPageView {
    path: string;
    status: SearchPageStatus;
    liveSince: Date | null;
    changedAt: Date;
    changedBy: { name: string | null } | null;
}

export interface RebuildView {
    running: boolean;
    startedAt?: Date | string;
    url?: string;
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
 * Search pages' publish records (DEC-193): which `/for/` pages are live on
 * this environment's saroh.in, set by staff in the admin console. Every
 * action is all or nothing in one transaction, writes a history row and an
 * admin audit entry per page, and queues one web deploy when what is live
 * changed. A path with no record reads as DRAFT and is not listed.
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
                select: { createdAt: true },
            }),
        ]);
        let rebuild: RebuildView = { running: false };
        if (queued) {
            rebuild = { running: true, startedAt: queued.createdAt };
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
     * Do one action to every path, or to none: any path the action can't be
     * done from where it is now is a 409 naming them all.
     */
    async act(
        staff: PlatformAdminInfo,
        action: SearchPageAction,
        paths: string[],
    ): Promise<{ pages: SearchPageView[]; rebuildQueued: boolean }> {
        const { rows, rebuildQueued } = await prisma.$transaction(
            async (tx) => {
                // One action at a time, so two can't both read a path as new.
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"search-pages:publish"}))`;
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
                const liveChanged: string[] = [];
                for (const { path, row, from, to } of changes) {
                    if (!to) continue;
                    const goesOff = from === "LIVE" && to !== "LIVE";
                    const data = {
                        status: to,
                        liveSince: to === "LIVE" ? now : null,
                        takenOffAt: goesOff ? now : (row?.takenOffAt ?? null),
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
                    if (changesLive(from, to)) liveChanged.push(path);
                }
                return {
                    rows: written,
                    rebuildQueued:
                        liveChanged.length > 0 &&
                        (await enqueueWebDeploy(tx, liveChanged)),
                };
            },
        );
        return { pages: await views(rows), rebuildQueued };
    }

    /** For the site's build: what is live, and what was and is no longer. */
    async publicList(): Promise<{
        live: string[];
        takenOff: { path: string; at: Date }[];
    }> {
        const rows = await prisma.searchPage.findMany({
            where: {
                OR: [{ status: "LIVE" }, { takenOffAt: { not: null } }],
            },
            orderBy: { path: "asc" },
            select: { path: true, status: true, takenOffAt: true },
        });
        return {
            live: rows.filter((r) => r.status === "LIVE").map((r) => r.path),
            takenOff: rows.flatMap((r) =>
                r.status !== "LIVE" && r.takenOffAt
                    ? [{ path: r.path, at: r.takenOffAt }]
                    : [],
            ),
        };
    }
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
        rows.flatMap((r) => (r.changedByUserId ? [r.changedByUserId] : [])),
    );
    return rows.map((r) => ({
        path: r.path,
        status: r.status,
        liveSince: r.liveSince,
        changedAt: r.changedAt,
        changedBy:
            r.changedByUserId && names.has(r.changedByUserId)
                ? { name: names.get(r.changedByUserId) ?? null }
                : null,
    }));
}
