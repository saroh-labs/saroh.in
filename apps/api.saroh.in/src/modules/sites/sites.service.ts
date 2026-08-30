import {
    BadRequestException,
    ConflictException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from "@nestjs/common";
import { parseSectionContent, Prisma, prisma } from "@saroh/database";
import type { TemplateContext } from "@saroh/templates";
import {
    getTemplate,
    instantiateTemplate,
    STARTER_TEMPLATE_ID,
    starterTemplate,
    TemplateInstantiationError,
} from "@saroh/templates";

import type { OrganizationContext } from "../../common/types/organization-context";
import { EntitlementService } from "../billing/entitlement.service";
import { authorize } from "../organizations/organization-policy";
import type {
    CreateSiteFromTemplateDto,
    UpdateDraftSectionsDto,
    UpdateSiteSettingsDto,
} from "./dto";
import { sanitizeSectionContent } from "./sanitize";

/** What creating a site returns to the caller: the new site's identity. */
export interface CreatedSite {
    siteId: string;
    slug: string;
}

/** A section as returned by the draft-editing endpoints. */
export interface DraftSectionView {
    id: string;
    type: string;
    contractVersion: number;
    order: number;
    content: unknown;
}

/** A page's editable DRAFT version + its ordered sections. */
export interface PageDraftView {
    pageId: string;
    pageVersionId: string;
    status: "DRAFT";
    sections: DraftSectionView[];
}

/** What a publish returns: the new immutable Publication + the live pointer. */
export interface PublishResult {
    publicationId: string;
    publishedAt: Date;
    currentPublicationId: string;
}

/** The public read contract: only the current, immutable Publication snapshot. */
export interface PublicSiteView {
    snapshot: unknown;
    publishedAt: Date;
}

/**
 * Turn an arbitrary name/slug input into a URL-safe site slug. Pure (no DB).
 * A small local copy of the organization slugify so the sites module has no
 * cross-module import; the CMS slug rules are identical for now.
 */
function slugify(input: string): string {
    const collapsed = input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s_-]/g, "")
        .replace(/[\s_-]+/g, "-");
    // Trim leading/trailing "-" by index rather than /^-+|-+$/. The collapse
    // above already leaves at most one dash in a row, so the regex could not
    // actually backtrack — but CodeQL cannot see that (js/polynomial-redos),
    // and an index scan is unconditionally linear.
    let start = 0;
    let end = collapsed.length;
    while (start < end && collapsed[start] === "-") start++;
    while (end > start && collapsed[end - 1] === "-") end--;
    return collapsed.slice(start, end);
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
    constructor(private readonly entitlements: EntitlementService) {}

    /**
     * Create a draft Site (pages + DRAFT versions + sections) from a template.
     *
     * Flow: authorize `site:create` → enforce the plan's `sites` limit →
     * resolve the template (latest starter by default) → load the org's name +
     * business profile into a {@link TemplateContext} → instantiate
     * (contract-validated pages) → derive + collision-check the slug → persist
     * the whole tree in one transaction.
     */
    async createFromTemplate(
        ctx: OrganizationContext,
        dto: CreateSiteFromTemplateDto,
    ): Promise<CreatedSite> {
        authorize(ctx, "site:create");

        // Enforce the subscription's `sites` cap (S7-005). Count the org's live
        // sites (soft-deleted excluded) and let the EntitlementService throw a
        // 403 when the org is already at its plan limit. FREE default is 1.
        const siteCount = await prisma.site.count({
            where: { organizationId: ctx.organizationId, deletedAt: null },
        });
        await this.entitlements.check(ctx.organizationId, "sites", siteCount);

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

    /**
     * List the org's non-deleted sites (newest first), each with the state it is
     * actually in (#191). Requires `site:read`.
     *
     * A name and an address look the same whether a site is live, never
     * published, or waiting on a DNS record — and those are exactly the states
     * that strand a site invisibly. So the list resolves them here rather than
     * making the merchant open each site to find out.
     *
     * `hasUnpublishedChanges` compares each page's newest DRAFT against the
     * publication that is live. It is deliberately a BOOLEAN, not a count: a
     * precise "3 sections changed" means diffing every draft section against the
     * snapshot for every site in the list, and a number that disagrees with the
     * editor's would be worse than no number. The count belongs where one site
     * is already loaded.
     */
    async listSites(ctx: OrganizationContext) {
        authorize(ctx, "site:read");
        const sites = await prisma.site.findMany({
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
                currentPublication: { select: { publishedAt: true } },
                // A claim that is not VERIFIED is the case worth surfacing: the
                // merchant thinks they have connected a domain and nothing
                // routes to it yet.
                claimedDomains: { select: { hostname: true, status: true } },
                pages: {
                    select: {
                        versions: {
                            where: { status: "DRAFT" },
                            orderBy: { updatedAt: "desc" },
                            take: 1,
                            select: { updatedAt: true },
                        },
                    },
                },
            },
        });

        return sites.map(({ pages, claimedDomains, ...site }) => {
            const publishedAt = site.currentPublication?.publishedAt ?? null;
            const lastDraftEdit = pages
                .flatMap((page) => page.versions)
                .reduce<Date | null>(
                    (latest, v) =>
                        latest === null || v.updatedAt > latest
                            ? v.updatedAt
                            : latest,
                    null,
                );
            return {
                ...site,
                // Unpublished work only means something once there is something
                // to compare against; before the first publish the site's state
                // is "never published", which says more.
                hasUnpublishedChanges:
                    publishedAt !== null &&
                    lastDraftEdit !== null &&
                    lastDraftEdit > publishedAt,
                pendingDomain:
                    claimedDomains.find((d) => d.status !== "VERIFIED")
                        ?.hostname ?? null,
            };
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
                // Search + social (#188).
                seoTitle: true,
                seoDescription: true,
                socialImageUrl: true,
                createdAt: true,
                updatedAt: true,
                // When the site last went live. Read through the current
                // publication rather than stamped on the Site, so it cannot
                // drift from the publication history it describes.
                currentPublication: { select: { publishedAt: true } },
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
     * Update a site's search and social settings (#188).
     *
     * ABSENT and NULL are deliberately different: a field the caller omitted is
     * left alone, a field sent as null is cleared. A settings form that PATCHes
     * only what changed must not wipe what it did not send, and a merchant
     * removing a share image must be able to actually remove it.
     *
     * Requires `site:update` — the same gate as renaming a site, because this is
     * what the public sees. Writing here does NOT publish: these values reach
     * the live site only through the next publish, exactly like a section edit.
     */
    async updateSettings(
        ctx: OrganizationContext,
        siteId: string,
        dto: UpdateSiteSettingsDto,
    ) {
        authorize(ctx, "site:update");
        await this.assertSiteInOrg(ctx, siteId);

        const data: {
            seoTitle?: string | null;
            seoDescription?: string | null;
            socialImageUrl?: string | null;
        } = {};
        if (dto.seoTitle !== undefined) data.seoTitle = dto.seoTitle;
        if (dto.seoDescription !== undefined)
            data.seoDescription = dto.seoDescription;
        if (dto.socialImageUrl !== undefined)
            data.socialImageUrl = dto.socialImageUrl;

        const site = await prisma.site.update({
            where: { id: siteId },
            data,
            select: {
                id: true,
                seoTitle: true,
                seoDescription: true,
                socialImageUrl: true,
            },
        });
        return site;
    }

    // -----------------------------------------------------------------------
    // Draft section editing (S2-005) — authorize `section:write`
    // -----------------------------------------------------------------------

    /**
     * Return a page's editable DRAFT PageVersion + its ordered sections,
     * creating an empty DRAFT if the page has none yet. Requires `section:write`
     * (this is the editor's load path). The site and page are proven to belong
     * to `ctx.organizationId` first, so a cross-tenant id is a 404.
     */
    async getPageDraft(
        ctx: OrganizationContext,
        siteId: string,
        pageId: string,
    ): Promise<PageDraftView> {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        await this.assertPageInSite(ctx, siteId, pageId);

        const version = await this.getOrCreateDraftVersion(prisma, ctx, pageId);
        const sections = await prisma.section.findMany({
            where: { pageVersionId: version.id },
            orderBy: { order: "asc" },
            select: {
                id: true,
                type: true,
                contractVersion: true,
                order: true,
                content: true,
            },
        });
        return { pageId, pageVersionId: version.id, status: "DRAFT", sections };
    }

    /**
     * Replace a page's DRAFT sections with an ordered list. Requires
     * `section:write`. EVERY incoming section is validated through the section
     * contract (`parseSectionContent`) BEFORE any write; the first failure
     * rejects the whole request with a `400` naming the offending index and
     * reason (nothing is written). On success, in ONE transaction the draft's
     * existing Section rows are deleted and replaced with new rows whose
     * `order = array index` (a whole-list replace keeps ordering gap-free and
     * the write atomic). The persisted `content` is the contract-NORMALIZED
     * value (defaults applied). Sanitization is deferred to publish, per the
     * contract's sanitization boundary.
     */
    async replaceDraftSections(
        ctx: OrganizationContext,
        siteId: string,
        pageId: string,
        dto: UpdateDraftSectionsDto,
    ): Promise<PageDraftView> {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        await this.assertPageInSite(ctx, siteId, pageId);

        // Validate the entire list up front — reject before touching the DB.
        const validated = dto.sections.map((section, index) => {
            const result = parseSectionContent(
                section.type,
                section.contractVersion,
                section.content,
            );
            if (!result.success) {
                throw new BadRequestException({
                    message: `Section at index ${index} is invalid: ${result.error.message}`,
                    index,
                    section: {
                        type: section.type,
                        contractVersion: section.contractVersion,
                    },
                    error: result.error,
                });
            }
            return {
                type: section.type,
                contractVersion: section.contractVersion,
                order: index,
                content: result.data,
            };
        });

        return prisma.$transaction(async (tx) => {
            const version = await this.getOrCreateDraftVersion(tx, ctx, pageId);
            await tx.section.deleteMany({
                where: { pageVersionId: version.id },
            });
            if (validated.length > 0) {
                await tx.section.createMany({
                    data: validated.map((s) => ({
                        pageVersionId: version.id,
                        organizationId: ctx.organizationId,
                        type: s.type,
                        contractVersion: s.contractVersion,
                        order: s.order,
                        content: s.content as Prisma.InputJsonValue,
                    })),
                });
            }
            const sections = await tx.section.findMany({
                where: { pageVersionId: version.id },
                orderBy: { order: "asc" },
                select: {
                    id: true,
                    type: true,
                    contractVersion: true,
                    order: true,
                    content: true,
                },
            });
            return {
                pageId,
                pageVersionId: version.id,
                status: "DRAFT",
                sections,
            };
        });
    }

    // -----------------------------------------------------------------------
    // Immutable publish (S2-005) — authorize `site:publish`
    // -----------------------------------------------------------------------

    /**
     * Publish the site: build a self-contained, SANITIZED snapshot of every
     * page from its current DRAFT version, then — in ONE transaction — append a
     * new immutable {@link Publication} and repoint `Site.currentPublicationId`
     * at it. Requires `site:publish`. The site must belong to
     * `ctx.organizationId` (else 404).
     *
     * Immutability: a Publication is NEVER updated. Republishing inserts a NEW
     * row and repoints the live pointer; rollback is simply repointing to an
     * older row. Rich fields the contract flags (`richText.value`) are sanitized
     * on the way IN, so the snapshot the public renderer reads is already safe.
     *
     * The DRAFT PageVersions are intentionally left DRAFT (not flipped to
     * PUBLISHED): the draft stays the durable working copy for the next edit,
     * and the immutable Publication is the published artifact. Republish just
     * re-snapshots the current drafts.
     */
    async publishSite(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<PublishResult> {
        authorize(ctx, "site:publish");

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
                seoTitle: true,
                seoDescription: true,
                socialImageUrl: true,
                pages: {
                    orderBy: { path: "asc" },
                    select: {
                        path: true,
                        title: true,
                        isHome: true,
                        versions: {
                            where: { status: "DRAFT" },
                            orderBy: { createdAt: "desc" },
                            take: 1,
                            select: {
                                sections: {
                                    orderBy: { order: "asc" },
                                    select: {
                                        type: true,
                                        contractVersion: true,
                                        content: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!site) {
            throw new NotFoundException(`Site "${siteId}" not found`);
        }

        const publishedAt = new Date();
        const pages = site.pages.map((page) => {
            // `versions` holds the page's latest DRAFT (query `take: 1`) or is
            // empty when the page has none; flatMap yields that draft's ordered
            // sections, or [] — no draft, no sections.
            const sections = page.versions.flatMap((version) =>
                version.sections.map((section) => {
                    // Defensive: a draft section should already be
                    // contract-valid, but publish is the last gate before an
                    // immutable write.
                    const parsed = parseSectionContent(
                        section.type,
                        section.contractVersion,
                        section.content,
                    );
                    if (!parsed.success) {
                        throw new BadRequestException(
                            `Cannot publish: page "${page.path}" has an invalid "${section.type}" section (${parsed.error.message})`,
                        );
                    }
                    // SANITIZE the contract-flagged rich fields (e.g.
                    // richText.value) BEFORE they enter the snapshot. A no-op
                    // when the contract flags nothing.
                    const content = sanitizeSectionContent(
                        parsed.data,
                        parsed.contract.sanitizedFields,
                    );
                    return {
                        type: section.type,
                        contractVersion: section.contractVersion,
                        content,
                    };
                }),
            );
            return {
                path: page.path,
                title: page.title,
                isHome: page.isHome,
                sections,
            };
        });

        const snapshot = {
            site: {
                name: site.name,
                slug: site.slug,
                // Search + social travel INTO the snapshot (#188). The public
                // renderer reads only this table, so a title left behind here
                // would never reach a search engine no matter how many times
                // the merchant saved it.
                seoTitle: site.seoTitle,
                seoDescription: site.seoDescription,
                socialImageUrl: site.socialImageUrl,
            },
            pages,
            publishedAt: publishedAt.toISOString(),
        };

        // The Site does not track which template produced it; default the
        // Publication's required (non-null) template stamp to the starter
        // template's identity/version.
        return prisma.$transaction(async (tx) => {
            const publication = await tx.publication.create({
                data: {
                    siteId: site.id,
                    organizationId: ctx.organizationId,
                    snapshot: snapshot as Prisma.InputJsonValue,
                    templateId: starterTemplate.id,
                    templateVersion: starterTemplate.version,
                    publishedByUserId: ctx.userId,
                    publishedAt,
                },
                select: { id: true, publishedAt: true },
            });
            await tx.site.update({
                where: { id: site.id },
                data: { currentPublicationId: publication.id },
            });
            return {
                publicationId: publication.id,
                publishedAt: publication.publishedAt,
                currentPublicationId: publication.id,
            };
        });
    }

    // -----------------------------------------------------------------------
    // Public read (S2-005) — NO auth; only the current immutable Publication
    // -----------------------------------------------------------------------

    /**
     * Public: resolve a site by its platform subdomain to its CURRENT
     * publication snapshot. Returns 404 if the subdomain is unknown, the site is
     * soft-deleted, or the site has never published. DRAFTS ARE NEVER RETURNED —
     * only `currentPublication.snapshot` is read.
     */
    async getPublicationBySubdomain(
        subdomain: string,
    ): Promise<PublicSiteView> {
        return this.resolveCurrentPublication(
            { subdomain, deletedAt: null },
            `subdomain "${subdomain}"`,
        );
    }

    /**
     * Public: resolve a site by id to its CURRENT publication snapshot. Same
     * guarantees as {@link getPublicationBySubdomain}: only the immutable
     * current Publication is ever exposed; drafts are never reachable here.
     */
    async getPublicationBySiteId(siteId: string): Promise<PublicSiteView> {
        return this.resolveCurrentPublication(
            { id: siteId, deletedAt: null },
            `site "${siteId}"`,
        );
    }

    /**
     * Shared public resolver: load ONLY `currentPublication.snapshot` for the
     * matched site. Because the query selects nothing but the current
     * Publication, there is no path by which a draft or another org's content
     * could be returned. 404 when the site is missing or unpublished.
     */
    private async resolveCurrentPublication(
        where: Prisma.SiteWhereInput,
        label: string,
    ): Promise<PublicSiteView> {
        const site = await prisma.site.findFirst({
            where,
            select: {
                currentPublication: {
                    select: { snapshot: true, publishedAt: true },
                },
            },
        });
        if (!site?.currentPublication) {
            throw new NotFoundException(`No published site found for ${label}`);
        }
        return {
            snapshot: site.currentPublication.snapshot,
            publishedAt: site.currentPublication.publishedAt,
        };
    }

    // -----------------------------------------------------------------------
    // Shared tenant-scoping + draft helpers
    // -----------------------------------------------------------------------

    /** Prove `siteId` is a live site in the ctx org, or 404. */
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

    /** Prove `pageId` belongs to `siteId` in the ctx org, or 404. */
    private async assertPageInSite(
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
    private async getOrCreateDraftVersion(
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
