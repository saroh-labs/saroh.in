import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import type { CreateSiteRedirectDto } from "./dto";
import { reservedPathFor } from "./page-kinds";
import { assertSiteInOrg } from "./site-access";
import {
    ownRedirectProblem,
    planPageMove,
    snapshotPagePaths,
    snapshotRedirectList,
} from "./site-redirects";

type Db = Pick<Prisma.TransactionClient, "site" | "siteRedirect">;

/** One old link that forwards, as Links and sharing lists it. */
export interface SiteRedirectView {
    id: string;
    fromPath: string;
    toPath: string;
    /** The page it opens, by its title; null when that page is gone. */
    toTitle: string | null;
    /** AUTO: the page's link changed. OWN: the merchant added it. */
    source: "AUTO" | "OWN";
    /** Whether the live site forwards it yet (else it waits for Publish). */
    live: boolean;
    createdAt: Date;
}

/**
 * A site's own old links (OWN) it may keep (W4, 21 Nov 2026): each one rides
 * in every publication snapshot. Never shown as a number.
 */
export const OWN_REDIRECTS_PER_SITE = 500;

/** One page of the list; `after` (the last `fromPath` seen) reads the next. */
export const REDIRECTS_LISTED = 1000;

export const REDIRECTS_FULL_MESSAGE =
    "Your site has as many old links as it can keep. Remove one you no longer need, then add this one.";

const REDIRECT_SELECT = {
    id: true,
    fromPath: true,
    toPath: true,
    source: true,
    createdAt: true,
} satisfies Prisma.SiteRedirectSelect;

/**
 * A page's link changed from `oldPath` to `newPath`: keep the old link
 * forwarding when the live site serves it (forever, owner decision O2), point
 * every forward that landed on the old link at the new one, and take out any
 * forward the new link now shadows. On the caller's transaction, beside the
 * page's own write.
 */
export async function followPageMove(
    db: Db,
    input: {
        organizationId: string;
        siteId: string;
        oldPath: string;
        newPath: string;
        userId: string;
    },
): Promise<void> {
    const [site, redirects] = await Promise.all([
        db.site.findUnique({
            where: { id: input.siteId },
            select: { currentPublication: { select: { snapshot: true } } },
        }),
        db.siteRedirect.findMany({
            where: { siteId: input.siteId, removedAt: null },
            select: { id: true, fromPath: true, toPath: true },
        }),
    ]);
    const plan = planPageMove({
        redirects,
        oldPath: input.oldPath,
        newPath: input.newPath,
        oldPathIsLive: snapshotPagePaths(
            site?.currentPublication?.snapshot,
        ).has(input.oldPath),
    });
    if (plan.remove.length > 0) {
        await db.siteRedirect.updateMany({
            where: { id: { in: plan.remove } },
            data: { removedAt: new Date() },
        });
    }
    if (plan.retarget.length > 0) {
        await db.siteRedirect.updateMany({
            where: { id: { in: plan.retarget } },
            data: { toPath: input.newPath },
        });
    }
    if (plan.create) {
        await db.siteRedirect.create({
            data: {
                organizationId: input.organizationId,
                siteId: input.siteId,
                fromPath: plan.create.from,
                toPath: plan.create.to,
                source: "AUTO",
                createdByUserId: input.userId,
            },
        });
    }
}

/** A page now has `path`: the page wins over any forward from it. */
export async function dropRedirectsAt(
    db: Pick<Prisma.TransactionClient, "siteRedirect">,
    siteId: string,
    path: string,
): Promise<void> {
    await db.siteRedirect.updateMany({
        where: { siteId, fromPath: path, removedAt: null },
        data: { removedAt: new Date() },
    });
}

/**
 * Old links that forward, for Links and sharing (KTD-3): the ones a page's
 * link change made, and the merchant's own (an old site's links). Every
 * change waits for Publish.
 */
@Injectable()
export class SiteRedirectsService {
    /** Every forward the next publish would carry, with its page. `site:read`. */
    async list(
        ctx: OrganizationContext,
        siteId: string,
        after?: string,
    ): Promise<SiteRedirectView[]> {
        authorize(ctx, "site:read");
        await assertSiteInOrg(ctx, siteId);
        const [rows, pages, site] = await Promise.all([
            prisma.siteRedirect.findMany({
                where: {
                    siteId,
                    organizationId: ctx.organizationId,
                    removedAt: null,
                    ...(typeof after === "string" && after
                        ? { fromPath: { gt: after } }
                        : {}),
                },
                orderBy: { fromPath: "asc" },
                take: REDIRECTS_LISTED,
                select: REDIRECT_SELECT,
            }),
            prisma.page.findMany({
                where: { siteId, organizationId: ctx.organizationId },
                select: { path: true, title: true },
            }),
            prisma.site.findFirst({
                where: { id: siteId, organizationId: ctx.organizationId },
                select: {
                    currentPublication: { select: { snapshot: true } },
                },
            }),
        ]);
        const titles = new Map(pages.map((p) => [p.path, p.title]));
        const live = new Set(
            snapshotRedirectList(site?.currentPublication?.snapshot).map(
                (r) => `${r.from} ${r.to}`,
            ),
        );
        // A forward from a built-in route never goes live (`snapshotRedirects`).
        return rows
            .filter((r) => reservedPathFor(r.fromPath) === null)
            .map((r) => ({
                ...r,
                toTitle: titles.get(r.toPath) ?? null,
                live: live.has(`${r.fromPath} ${r.toPath}`),
            }));
    }

    /** Forward one of the merchant's old links to a page. `site:update`. */
    async create(
        ctx: OrganizationContext,
        siteId: string,
        dto: CreateSiteRedirectDto,
    ): Promise<SiteRedirectView> {
        authorize(ctx, "site:update");
        await assertSiteInOrg(ctx, siteId);
        const pages = await prisma.page.findMany({
            where: { siteId, organizationId: ctx.organizationId },
            select: { path: true, title: true },
        });
        const problem = ownRedirectProblem(
            dto.fromPath,
            dto.toPath,
            new Set(pages.map((p) => p.path)),
        );
        if (problem) {
            throw new BadRequestException({
                message: problem,
                details: { field: "fromPath" },
            });
        }
        const existing = await prisma.siteRedirect.findFirst({
            where: { siteId, fromPath: dto.fromPath, removedAt: null },
            select: { toPath: true },
        });
        if (existing) throw alreadyForwards(dto.fromPath, existing.toPath);
        // shortcut: two adds at once may pass one over the cap; harmless, it only bounds size.
        const own = await prisma.siteRedirect.count({
            where: { siteId, source: "OWN", removedAt: null },
        });
        if (own >= OWN_REDIRECTS_PER_SITE) {
            throw new BadRequestException({
                message: REDIRECTS_FULL_MESSAGE,
                details: { field: "fromPath", reason: "full" },
            });
        }
        try {
            const row = await prisma.siteRedirect.create({
                data: {
                    organizationId: ctx.organizationId,
                    siteId,
                    fromPath: dto.fromPath,
                    toPath: dto.toPath,
                    source: "OWN",
                    createdByUserId: ctx.userId,
                },
                select: REDIRECT_SELECT,
            });
            return {
                ...row,
                toTitle:
                    pages.find((p) => p.path === row.toPath)?.title ?? null,
                live: false,
            };
        } catch (err) {
            // Two saves of the same old link at once: the index decides.
            if (prismaErrorCode(err) === "P2002") {
                throw alreadyForwards(dto.fromPath, null);
            }
            throw err;
        }
    }

    /**
     * Stop forwarding one of the merchant's own old links (from the next
     * publish). A forward a page's link change made is kept forever (O2):
     * someone may still have that link on a card or in a message.
     */
    async remove(
        ctx: OrganizationContext,
        siteId: string,
        redirectId: string,
    ): Promise<{ removed: true }> {
        authorize(ctx, "site:update");
        await assertSiteInOrg(ctx, siteId);
        const row = await prisma.siteRedirect.findFirst({
            where: {
                id: redirectId,
                siteId,
                organizationId: ctx.organizationId,
                removedAt: null,
            },
            select: { id: true, source: true, toPath: true },
        });
        if (!row) throw new NotFoundException("That old link isn't here");
        if (row.source === "AUTO") {
            throw new BadRequestException({
                message:
                    "This old link forwards here because the page's link changed. It stays, so links people already have keep working.",
                details: { reason: "auto" },
            });
        }
        const at = new Date();
        await prisma.$transaction([
            prisma.siteRedirect.update({
                where: { id: row.id },
                data: { removedAt: at },
            }),
            // A removal has no row of its own: its page's unit names the
            // remover (KTD-4, R4 21 Nov 2026).
            prisma.page.updateMany({
                where: {
                    siteId,
                    organizationId: ctx.organizationId,
                    path: row.toPath,
                },
                data: {
                    settingsEditedByUserId: ctx.userId,
                    settingsEditedAt: at,
                },
            }),
        ]);
        return { removed: true };
    }
}

function alreadyForwards(fromPath: string, toPath: string | null) {
    return new ConflictException({
        message: toPath
            ? `${fromPath} already forwards to ${toPath}. Remove that first.`
            : `${fromPath} already forwards to a page. Remove that first.`,
        details: { field: "fromPath", reason: "taken" },
    });
}
