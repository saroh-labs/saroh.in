import { GoneException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { randomBytes } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import type { SiteSnapshot } from "./sites.service";
import { SitesService } from "./sites.service";

/**
 * Preview links (#198): a site's DRAFT, shown to whoever holds the link.
 *
 * The other half of review. Notes and approvals shipped in #193; the Review
 * tab's empty state told the merchant to "share a preview", and nothing in the
 * product could. This is that action — and NOTHING about it publishes
 * anything. A preview is built from the draft by the same builder publish
 * uses, served to the renderer by token, and thrown away.
 *
 * Three facts a sharer needs are first-class, not derived:
 *  - when it stops working (`expiresAt`), so they can say so before sending;
 *  - whether they took it back (`revokedAt`), and that this is immediate;
 *  - whether anyone opened it (`lastUsedAt`), the first question asked when
 *    the feedback does not arrive.
 */

/** The choices offered, in days. Seven is the default the design names. */
export const PREVIEW_LINK_DAYS = [1, 7, 30] as const;
export type PreviewLinkDays = (typeof PREVIEW_LINK_DAYS)[number];

export type PreviewLinkState = "active" | "expired" | "revoked";

export interface PreviewLinkView {
    id: string;
    token: string;
    state: PreviewLinkState;
    createdAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    createdBy: { name: string | null };
}

/** What the renderer gets for a valid token. */
export interface PreviewView {
    snapshot: SiteSnapshot;
    site: { name: string };
    expiresAt: Date;
}

/** Why a token no longer works — the page says this in words, not a 404. */
export type PreviewGoneReason = "expired" | "revoked";

const linkSelect = {
    id: true,
    token: true,
    createdAt: true,
    expiresAt: true,
    revokedAt: true,
    lastUsedAt: true,
    createdBy: { select: { name: true } },
} as const;

export function previewLinkState(
    link: { expiresAt: Date; revokedAt: Date | null },
    now = new Date(),
): PreviewLinkState {
    if (link.revokedAt) return "revoked";
    if (link.expiresAt.getTime() <= now.getTime()) return "expired";
    return "active";
}

function toView(
    link: {
        id: string;
        token: string;
        createdAt: Date;
        expiresAt: Date;
        revokedAt: Date | null;
        lastUsedAt: Date | null;
        createdBy: { name: string | null };
    },
    now = new Date(),
): PreviewLinkView {
    return { ...link, state: previewLinkState(link, now) };
}

@Injectable()
export class SitePreviewLinksService {
    constructor(private readonly sites: SitesService) {}

    /**
     * Mint a link. Requires `site:update` — sharing the draft is the owner's
     * call, like everything else that decides who sees unpublished work.
     */
    async create(
        ctx: OrganizationContext,
        siteId: string,
        input: { expiresInDays: PreviewLinkDays },
    ): Promise<PreviewLinkView> {
        authorize(ctx, "site:update");
        await this.assertSiteInOrg(ctx, siteId);

        const now = new Date();
        const expiresAt = new Date(
            now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000,
        );
        const link = await prisma.sitePreviewLink.create({
            data: {
                siteId,
                organizationId: ctx.organizationId,
                createdByUserId: ctx.userId,
                // 32 random bytes is the whole secret. base64url keeps it
                // short enough to read aloud and safe in a path segment.
                token: randomBytes(32).toString("base64url"),
                expiresAt,
            },
            select: linkSelect,
        });
        return toView(link, now);
    }

    /**
     * Every link for the site, newest first, each with its state. Expired and
     * revoked ones are returned too: "did I already share this, and with what
     * expiry" is a question the list answers. Requires `site:read`.
     */
    async list(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<PreviewLinkView[]> {
        authorize(ctx, "site:read");
        await this.assertSiteInOrg(ctx, siteId);
        const now = new Date();
        const links = await prisma.sitePreviewLink.findMany({
            where: { siteId, organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
            select: linkSelect,
        });
        return links.map((link) => toView(link, now));
    }

    /**
     * Take a link back. Takes effect on the next request for it — there is no
     * cache in between, so "immediately" is literally true. Requires
     * `site:update`. Revoking twice is not an error.
     */
    async revoke(
        ctx: OrganizationContext,
        siteId: string,
        linkId: string,
    ): Promise<PreviewLinkView> {
        authorize(ctx, "site:update");
        await this.assertSiteInOrg(ctx, siteId);
        const existing = await prisma.sitePreviewLink.findFirst({
            where: { id: linkId, siteId, organizationId: ctx.organizationId },
            select: { id: true, revokedAt: true },
        });
        if (!existing) {
            throw new NotFoundException(`Preview link "${linkId}" not found`);
        }
        const link = await prisma.sitePreviewLink.update({
            where: { id: existing.id },
            data: { revokedAt: existing.revokedAt ?? new Date() },
            select: linkSelect,
        });
        return toView(link);
    }

    /**
     * PUBLIC: the draft behind a token, built fresh from the current draft on
     * every request so a reviewer always sees the latest save.
     *
     * A token that has stopped working is a 410 that names why — `expired` or
     * `revoked` — never a 404. The renderer turns the reason into a sentence;
     * an unknown token IS a 404, because saying "revoked" to a guessed token
     * would confirm it once existed.
     */
    async resolve(token: string): Promise<PreviewView> {
        const link = await prisma.sitePreviewLink.findUnique({
            where: { token },
            select: {
                id: true,
                siteId: true,
                organizationId: true,
                expiresAt: true,
                revokedAt: true,
            },
        });
        if (!link) {
            throw new NotFoundException("No preview at this address");
        }
        const state = previewLinkState(link);
        if (state !== "active") {
            // The reason rides in `details`, the one slot the api's error
            // envelope passes through; the renderer branches on it.
            throw new GoneException({
                message:
                    state === "revoked"
                        ? "This preview link was taken back."
                        : "This preview link has stopped working.",
                details: { reason: state satisfies PreviewGoneReason },
            });
        }

        const site = await this.sites.loadDraftSite({
            id: link.siteId,
            organizationId: link.organizationId,
            deletedAt: null,
        });
        if (!site) {
            throw new NotFoundException("No preview at this address");
        }

        // Recorded, not awaited: a reviewer's page must not wait on, or fail
        // for, a bookkeeping write.
        void prisma.sitePreviewLink
            .update({
                where: { id: link.id },
                data: { lastUsedAt: new Date() },
                select: { id: true },
            })
            .catch(() => undefined);

        return {
            snapshot: this.sites.buildSnapshot(site, new Date()),
            site: { name: site.name },
            expiresAt: link.expiresAt,
        };
    }

    private async assertSiteInOrg(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<void> {
        const site = await prisma.site.findFirst({
            where: {
                id: siteId,
                organizationId: ctx.organizationId,
                deletedAt: null,
            },
            select: { id: true },
        });
        if (!site) {
            throw new NotFoundException(`Site "${siteId}" not found`);
        }
    }
}
