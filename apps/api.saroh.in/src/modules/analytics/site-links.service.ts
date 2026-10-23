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
import {
    AuditAction,
    auditMetadata,
    AuditOutcome,
} from "../audit/audit.service";
import { businessTimezone } from "../bookings/staff-availability";
import { authorize } from "../organizations/organization-policy";
import type { InsightsPeriod } from "./period";
import { periodWindows } from "./period";
import { forgetSiteLinkLabels } from "./site-link-labels";
import {
    freeLinkLabel,
    linkLabelOf,
    linkLabelProblem,
    LINKS_PER_SITE_MAX,
} from "./site-links";
import type { LinkCounts } from "./visit-sources";
import { MIN_VISITS_PER_LABEL, readLinkCounts } from "./visit-sources";

/**
 * The links a business makes in Saroh to share its site (DEC-181, #1099),
 * on Insights › Where customers come from: list them with their visits and
 * paid in the period, make one from a name, archive one and bring it back
 * (Undo).
 *
 * - Reading is Insights' own `analytics:read`; making and archiving is
 *   `site:update`, the permission that already makes a site's QR codes.
 * - Each write goes to Activity (`site-link.created`, `.archived`,
 *   `.restored`), in its own transaction, with the link's name and label:
 *   the business's own words for a post, never a person's detail.
 * - A link is archived, never deleted, so a label's past figures keep
 *   their name; an archived label is free for a new link. The intake's
 *   short cache of a site's labels is dropped on every write
 *   (`site-link-labels.ts`).
 * - A link with fewer visits than a label needs to be shown on its own
 *   ({@link MIN_VISITS_PER_LABEL}) says so instead of its counts, as the
 *   sources table folds it into "Other links".
 */

/** One link as Insights reads it. */
export interface SiteLinkView {
    id: string;
    siteId: string;
    /** What the team calls it: "Diwali post". */
    name: string;
    /** The `ref` the link carries: "diwali-post". */
    label: string;
    createdAt: string;
    /**
     * Visits and paid in the period; null for both when it had fewer than
     * {@link MIN_VISITS_PER_LABEL} visits (`few`).
     */
    visits: number | null;
    paid: number | null;
    /** Fewer visits than a label needs to be shown on its own. */
    few: boolean;
}

/** The business's live links, newest first. */
export interface SiteLinksRead {
    links: SiteLinkView[];
    /** The fewest visits a link's counts are shown with. */
    minVisits: number;
}

const LINK_SELECT = {
    id: true,
    siteId: true,
    name: true,
    label: true,
    createdAt: true,
    archivedAt: true,
} as const;

type LinkRow = Prisma.SiteLinkGetPayload<{ select: typeof LINK_SELECT }>;

/** A link and its counts as the screen reads them. */
export function siteLinkView(
    row: Pick<LinkRow, "id" | "siteId" | "name" | "label" | "createdAt">,
    counts: LinkCounts | undefined,
): SiteLinkView {
    const visits = counts?.visits ?? 0;
    const few = visits < MIN_VISITS_PER_LABEL;
    return {
        id: row.id,
        siteId: row.siteId,
        name: row.name,
        label: row.label,
        createdAt: row.createdAt.toISOString(),
        visits: few ? null : visits,
        paid: few ? null : (counts?.paid ?? 0),
        few,
    };
}

/** What a link is made from. */
export interface MakeSiteLink {
    siteId: string;
    name: string;
    /** As shown and maybe changed; left out, made from the name. */
    label?: string;
}

@Injectable()
export class SiteLinksService {
    /**
     * The live links of one site, or of every site when `siteId` is null,
     * with their visits and paid in the period. `analytics:read`.
     */
    async list(
        ctx: OrganizationContext,
        period: InsightsPeriod,
        siteId: string | null = null,
        now: Date = new Date(),
    ): Promise<SiteLinksRead> {
        authorize(ctx, "analytics:read");
        const organizationId = ctx.organizationId;
        const zone = await businessTimezone(prisma, organizationId);
        const w = periodWindows(period, now, zone);
        const [rows, counts] = await Promise.all([
            prisma.siteLink.findMany({
                where: {
                    organizationId,
                    archivedAt: null,
                    ...(siteId ? { siteId } : {}),
                    site: { deletedAt: null },
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                select: LINK_SELECT,
            }),
            readLinkCounts(prisma, organizationId, {
                from: new Date(`${w.fromDate}T00:00:00Z`),
                to: new Date(`${w.toDate}T00:00:00Z`),
                ...(siteId ? { siteId } : {}),
            }),
        ]);
        return {
            links: rows.map((row) =>
                siteLinkView(row, counts.get(`${row.siteId}:${row.label}`)),
            ),
            minVisits: MIN_VISITS_PER_LABEL,
        };
    }

    /**
     * Make a link for one of the business's sites: its label is the one
     * shown (and maybe changed) on the screen, else made from the name.
     * A label asked for that another live link of the site has is a 409;
     * one made from the name takes the next free `-2`, `-3`. `site:update`.
     */
    async create(
        ctx: OrganizationContext,
        input: MakeSiteLink,
    ): Promise<SiteLinkView> {
        authorize(ctx, "site:update");
        const organizationId = ctx.organizationId;
        await this.site(organizationId, input.siteId);
        const name = input.name.trim();
        const typed = input.label?.trim().toLowerCase() ?? "";
        // The label as shown and maybe changed; none sent, made from the name.
        const asked = typed === "" ? null : typed;
        const proposed = asked ?? linkLabelOf(name);
        const problem = linkLabelProblem(proposed);
        if (problem) {
            throw new BadRequestException({
                message: LABEL_PROBLEM_WORDS[problem],
                details: { field: "label", reason: problem },
            });
        }

        const live = await prisma.siteLink.findMany({
            where: { organizationId, siteId: input.siteId, archivedAt: null },
            select: { label: true },
        });
        if (live.length >= LINKS_PER_SITE_MAX) {
            throw new ConflictException({
                message:
                    "This site has as many links as it can hold. Archive one you no longer share.",
                details: { reason: "too-many" },
            });
        }
        const taken = new Set(live.map((l) => l.label));
        const label =
            asked === null
                ? freeLinkLabel(proposed, taken)
                : taken.has(asked)
                  ? null
                  : asked;
        if (!label) throw takenLabel(proposed);

        try {
            const row = await prisma.$transaction(async (tx) => {
                const made = await tx.siteLink.create({
                    data: {
                        organizationId,
                        siteId: input.siteId,
                        name,
                        label,
                        createdByUserId: ctx.userId,
                    },
                    select: LINK_SELECT,
                });
                await recordInTx(tx, ctx, AuditAction.SiteLinkCreated, made);
                return made;
            });
            forgetSiteLinkLabels(input.siteId, organizationId);
            return siteLinkView(row, undefined);
        } catch (error) {
            // Another link took the label a moment ago.
            if (prismaErrorCode(error) === "P2002") throw takenLabel(label);
            throw error;
        }
    }

    /**
     * Archive a link: it stops counting as itself (its visits count under
     * their group) and leaves the list. Its past figures stay. Archiving
     * one already archived changes nothing. `site:update`.
     */
    async archive(
        ctx: OrganizationContext,
        linkId: string,
    ): Promise<SiteLinkView> {
        authorize(ctx, "site:update");
        const row = await this.link(ctx.organizationId, linkId);
        if (row.archivedAt) return siteLinkView(row, undefined);
        const done = await prisma.$transaction(async (tx) => {
            await tx.siteLink.updateMany({
                where: {
                    id: row.id,
                    organizationId: ctx.organizationId,
                    archivedAt: null,
                },
                data: { archivedAt: new Date() },
            });
            await recordInTx(tx, ctx, AuditAction.SiteLinkArchived, row);
            return row;
        });
        forgetSiteLinkLabels(row.siteId, ctx.organizationId);
        return siteLinkView(done, undefined);
    }

    /**
     * Bring an archived link back (Undo), while no live link of its site has
     * taken its label: then it is a 409 and the link stays archived. One
     * that is live changes nothing. `site:update`.
     */
    async restore(
        ctx: OrganizationContext,
        linkId: string,
    ): Promise<SiteLinkView> {
        authorize(ctx, "site:update");
        const row = await this.link(ctx.organizationId, linkId);
        if (!row.archivedAt) return siteLinkView(row, undefined);
        try {
            await prisma.$transaction(async (tx) => {
                await tx.siteLink.updateMany({
                    where: { id: row.id, organizationId: ctx.organizationId },
                    data: { archivedAt: null },
                });
                await recordInTx(tx, ctx, AuditAction.SiteLinkRestored, row);
            });
        } catch (error) {
            if (prismaErrorCode(error) === "P2002") {
                throw takenLabel(row.label);
            }
            throw error;
        }
        forgetSiteLinkLabels(row.siteId, ctx.organizationId);
        return siteLinkView(row, undefined);
    }

    /** The business's site, live; another business's or a deleted one is a 404. */
    private async site(organizationId: string, siteId: string): Promise<void> {
        const site = await prisma.site.findFirst({
            where: { id: siteId, organizationId, deletedAt: null },
            select: { id: true },
        });
        if (!site) throw new NotFoundException("Website not found");
    }

    /** One of the business's links; another business's is a 404. */
    private async link(
        organizationId: string,
        linkId: string,
    ): Promise<LinkRow> {
        const row = await prisma.siteLink.findFirst({
            where: { id: linkId, organizationId },
            select: LINK_SELECT,
        });
        if (!row) throw new NotFoundException("Link not found");
        return row;
    }
}

/** What is wrong with a label, in the screen's words. */
export const LABEL_PROBLEM_WORDS: Record<
    NonNullable<ReturnType<typeof linkLabelProblem>>,
    string
> = {
    empty: "Give the link a label.",
    shape: "Use lower-case letters, numbers and hyphens, up to 32, and no more than 6 numbers.",
    "group-word":
        "That word already means a place a visit comes from. Choose another label.",
};

function takenLabel(label: string): ConflictException {
    return new ConflictException({
        message: `Another link on this site uses ${label}. Choose another label.`,
        details: { field: "label", reason: "taken" },
    });
}

/** The Activity entry for a write, in its transaction. */
async function recordInTx(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    action: AuditAction,
    link: Pick<LinkRow, "id" | "siteId" | "name" | "label">,
): Promise<void> {
    await tx.auditEvent.create({
        data: {
            action,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "site-link",
            targetId: link.id,
            outcome: AuditOutcome.Success,
            metadata: auditMetadata(ctx.roleKey, {
                siteId: link.siteId,
                name: link.name,
                label: link.label,
            }),
        },
        select: { id: true },
    });
}
