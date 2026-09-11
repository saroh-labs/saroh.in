import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { TemplateContext } from "@saroh/templates";

import type { OrganizationContext } from "../../common/types/organization-context";

/**
 * Tenancy guards and write plumbing shared by every sites surface.
 *
 * These were five private methods on SitesService that never touched `this` —
 * the only state that class holds is the EntitlementService, used by exactly
 * one method. Which is why a 2,198-line service could not be split: four spec
 * files (sites-editing, sites-pages, sites-review, site-settings) already
 * describe the seams, but every candidate service needed assertSiteInOrg and
 * there was nowhere for it to live that was not the class itself.
 *
 * They belong together beyond that convenience. Each one is the same kind of
 * statement — this site is in this org, this page is in this site, this path is
 * free, this draft exists — and every org-scoped write must make it before
 * touching a row. Reading them in one file is how you check none is missing.
 */

/** Refuse a path another page on this site already holds. */
export async function assertPathIsFree(siteId: string, path: string) {
    const clash = await prisma.page.findFirst({
        where: { siteId, path },
        select: { title: true },
    });
    if (clash) {
        throw new BadRequestException(
            `The path ${path} is already used by "${clash.title}".`,
        );
    }
}

export async function assertSiteInOrg(
    ctx: OrganizationContext,
    siteId: string,
): Promise<{ id: string; currentPublicationId: string | null }> {
    const site = await prisma.site.findFirst({
        where: {
            id: siteId,
            organizationId: ctx.organizationId,
            deletedAt: null,
        },
        // Returns the row it already had to fetch. Callers that only need
        // the guard ignore it; version history needs to know which
        // publication is live, and a second query for a column this one
        // already read would be waste.
        select: { id: true, currentPublicationId: true },
    });
    if (!site) {
        throw new NotFoundException(`Site "${siteId}" not found`);
    }
    return site;
}

/** Prove `pageId` belongs to `siteId` in the ctx org, or 404. */
export async function assertPageInSite(
    ctx: OrganizationContext,
    siteId: string,
    pageId: string,
): Promise<void> {
    const page = await prisma.page.findFirst({
        where: {
            id: pageId,
            siteId,
            organizationId: ctx.organizationId,
        },
        select: { id: true },
    });
    if (!page) {
        throw new NotFoundException(`Page "${pageId}" not found`);
    }
}

/**
 * Get the page's latest DRAFT PageVersion, creating an empty one if none
 * exists. Takes a Prisma client/transaction so callers can run it inside a
 * write transaction. The caller must already have proven the page belongs
 * to the ctx org.
 */
export async function getOrCreateDraftVersion(
    client: Prisma.TransactionClient,
    ctx: OrganizationContext,
    pageId: string,
): Promise<{ id: string }> {
    const existing = await client.pageVersion.findFirst({
        where: {
            pageId,
            organizationId: ctx.organizationId,
            status: "DRAFT",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
    });
    if (existing) {
        return existing;
    }
    return client.pageVersion.create({
        data: {
            pageId,
            organizationId: ctx.organizationId,
            status: "DRAFT",
            createdByUserId: ctx.userId,
        },
        select: { id: true },
    });
}

/**
 * Build the {@link TemplateContext} from the org's name + optional business
 * profile (S1-004). Only fields the profile actually carries are mapped;
 * `tagline`/`description` have no profile column yet, so builders fall back
 * to name-derived defaults.
 */
export async function buildTemplateContext(
    organizationId: string,
): Promise<TemplateContext> {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
            name: true,
            businessProfile: {
                select: {
                    legalName: true,
                    contactEmail: true,
                    website: true,
                },
            },
        },
    });
    if (!org) {
        // The guard proved membership in this org, so it must exist; a miss
        // here is a real integrity fault, not a client error.
        throw new NotFoundException(
            `Organization "${organizationId}" not found`,
        );
    }
    const profile = org.businessProfile;
    return {
        organizationName: org.name,
        legalName: profile?.legalName ?? undefined,
        contactEmail: profile?.contactEmail ?? undefined,
        websiteUrl: profile?.website ?? undefined,
    };
}
