import {
    BadRequestException,
    ConflictException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";
import type { TemplateContext } from "@saroh/templates";
import {
    getTemplate,
    instantiateTemplate,
    STARTER_TEMPLATE_ID,
    TemplateInstantiationError,
} from "@saroh/templates";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import type { CreateSiteFromTemplateDto } from "./dto";

/** What creating a site returns to the caller: the new site's identity. */
export interface CreatedSite {
    siteId: string;
    slug: string;
}

/**
 * Turn an arbitrary name/slug input into a URL-safe site slug. Pure (no DB).
 * A small local copy of the organization slugify so the sites module has no
 * cross-module import; the CMS slug rules are identical for now.
 */
function slugify(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s_-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Draft Site creation from a template + the org's business profile (S2-003).
 *
 * `createFromTemplate` atomically stands up a whole publishing property: the
 * {@link Site}, and for every page the template lays down, a {@link Page}, a
 * DRAFT {@link PageVersion}, and that version's ordered {@link Section} rows —
 * all inside ONE `prisma.$transaction`, so a failure anywhere leaves NO partial
 * site. Every CMS row carries `organizationId = ctx.organizationId`
 * (denormalized for tenant isolation); nothing is ever taken from a
 * client-supplied org. Section content is already contract-validated by
 * `instantiateTemplate`, so persistence is a straight write.
 */
@Injectable()
export class SitesService {
    /**
     * Create a draft Site (pages + DRAFT versions + sections) from a template.
     *
     * Flow: authorize `site:create` → resolve the template (latest starter by
     * default) → load the org's name + business profile into a
     * {@link TemplateContext} → instantiate (contract-validated pages) → derive
     * + collision-check the slug → persist the whole tree in one transaction.
     */
    async createFromTemplate(
        ctx: OrganizationContext,
        dto: CreateSiteFromTemplateDto,
    ): Promise<CreatedSite> {
        authorize(ctx, "site:create");

        const templateId = dto.templateId ?? STARTER_TEMPLATE_ID;
        const template = getTemplate(templateId, dto.templateVersion);
        if (!template) {
            throw new NotFoundException(
                dto.templateVersion === undefined
                    ? `Unknown template "${templateId}"`
                    : `Unknown template "${templateId}" v${dto.templateVersion}`,
            );
        }

        const slug = slugify(dto.slug ?? dto.name);
        if (!slug) {
            throw new BadRequestException(
                "Site name must contain at least one alphanumeric character",
            );
        }

        const context = await this.buildTemplateContext(ctx.organizationId);

        let pages;
        try {
            pages = instantiateTemplate(template, context).pages;
        } catch (error) {
            if (error instanceof TemplateInstantiationError) {
                // A shipped template should never emit an invalid section; if it
                // does, that's a server bug, not bad client input.
                throw new InternalServerErrorException(
                    `Template "${template.id}" v${template.version} produced an invalid site`,
                );
            }
            throw error;
        }

        return prisma.$transaction(async (tx) => {
            // Fail fast on a taken slug with a clear 409 (the unique is
            // [organizationId, slug]); the check + create share the txn.
            const existing = await tx.site.findFirst({
                where: {
                    organizationId: ctx.organizationId,
                    slug,
                    deletedAt: null,
                },
                select: { id: true },
            });
            if (existing) {
                throw new ConflictException(
                    `A site with the slug "${slug}" already exists in this organization`,
                );
            }

            // Subdomain is globally unique when set; reject a clash up front
            // rather than surfacing a raw constraint error. (Full claim /
            // verification is S2-007.)
            if (dto.subdomain) {
                const taken = await tx.site.findUnique({
                    where: { subdomain: dto.subdomain },
                    select: { id: true },
                });
                if (taken) {
                    throw new ConflictException(
                        `The subdomain "${dto.subdomain}" is already taken`,
                    );
                }
            }

            const site = await tx.site.create({
                data: {
                    organizationId: ctx.organizationId,
                    name: dto.name,
                    slug,
                    subdomain: dto.subdomain,
                },
                select: { id: true, slug: true },
            });

            for (const page of pages) {
                await tx.page.create({
                    data: {
                        siteId: site.id,
                        organizationId: ctx.organizationId,
                        path: page.path,
                        title: page.title,
                        isHome: page.isHome,
                        versions: {
                            create: {
                                organizationId: ctx.organizationId,
                                status: "DRAFT",
                                createdByUserId: ctx.userId,
                                sections: {
                                    create: page.sections.map((section) => ({
                                        organizationId: ctx.organizationId,
                                        type: section.type,
                                        contractVersion:
                                            section.contractVersion,
                                        order: section.order,
                                        content:
                                            section.content as Prisma.InputJsonValue,
                                    })),
                                },
                            },
                        },
                    },
                });
            }

            return { siteId: site.id, slug: site.slug };
        });
    }

    /** List the org's non-deleted sites (newest first). Requires `site:read`. */
    async listSites(ctx: OrganizationContext) {
        authorize(ctx, "site:read");
        return prisma.site.findMany({
            where: { organizationId: ctx.organizationId, deletedAt: null },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                name: true,
                slug: true,
                subdomain: true,
                currentPublicationId: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    /**
     * Fetch one of the org's sites with its pages. 404 if it does not exist or
     * belongs to another org (cross-tenant reads are indistinguishable from
     * "not found"). Requires `site:read`.
     */
    async getSite(ctx: OrganizationContext, siteId: string) {
        authorize(ctx, "site:read");
        const site = await prisma.site.findFirst({
            where: {
                id: siteId,
                organizationId: ctx.organizationId,
                deletedAt: null,
            },
            select: {
                id: true,
                name: true,
                slug: true,
                subdomain: true,
                currentPublicationId: true,
                createdAt: true,
                updatedAt: true,
                pages: {
                    orderBy: { path: "asc" },
                    select: {
                        id: true,
                        path: true,
                        title: true,
                        isHome: true,
                    },
                },
            },
        });
        if (!site) {
            throw new NotFoundException(`Site "${siteId}" not found`);
        }
        return site;
    }

    /**
     * Build the {@link TemplateContext} from the org's name + optional business
     * profile (S1-004). Only fields the profile actually carries are mapped;
     * `tagline`/`description` have no profile column yet, so builders fall back
     * to name-derived defaults.
     */
    private async buildTemplateContext(
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
}
