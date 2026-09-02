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
import { randomUUID } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { EntitlementService } from "../billing/entitlement.service";
import { authorize } from "../organizations/organization-policy";
import type {
    CreateApprovalDto,
    CreateCommentDto,
    CreatePageDto,
    CreateSiteFromTemplateDto,
    UpdateDraftSectionsDto,
    UpdatePageDto,
    UpdateSiteSettingsDto,
} from "./dto";
import {
    countPendingSectionChanges,
    toPendingPages,
    toPublishableSection,
} from "./pending-changes";
import type { Flag, FlagType } from "./site-flags";
import { checkSite, FLAGS_AWAITING_NAVIGATION } from "./site-flags";
import type { SiteStyle, SiteStyleOptions } from "./site-style";
import { parseSiteStyle, siteStyleOptions } from "./site-style";

/** What creating a site returns to the caller: the new site's identity. */
/**
 * Mint a section key. Opaque and random rather than derived from position or
 * content: a key that encoded either would stop being stable the moment a
 * section moved or was edited, which is exactly what it exists to survive.
 */
function newSectionKey(): string {
    return randomUUID();
}

/**
 * Take the key a section claims, unless something earlier in the list already
 * claimed it. Keys are unique per page version, so two sections arriving with
 * the same one would fail the save outright; the duplicate gets a fresh
 * identity instead of taking down the request.
 */
function claimKey(seen: Set<string>, claimed: string | undefined): string {
    const key =
        claimed !== undefined && !seen.has(claimed) ? claimed : newSectionKey();
    seen.add(key);
    return key;
}

export interface CreatedSite {
    siteId: string;
    slug: string;
}

/** A reviewer's note as the Review tab shows it. */
export interface CommentView {
    id: string;
    pageId: string;
    pageTitle: string | null;
    sectionKey: string;
    body: string;
    resolvedAt: Date | null;
    createdAt: Date;
    author: { id: string; name: string };
    /** The section this was about is no longer on the page. */
    orphaned: boolean;
}

/** The site's review state — the latest verdict plus what is still open. */
export interface ReviewState {
    openNotes: number;
    latestApproval: { outcome: string; at: Date; by: string } | null;
}

/** A page as returned by the page endpoints and by getSite. */
export interface PageView {
    id: string;
    path: string;
    title: string;
    isHome: boolean;
}

/** A section as returned by the draft-editing endpoints. */
export interface DraftSectionView {
    id: string;
    type: string;
    contractVersion: number;
    order: number;
    content: unknown;
    /** Hidden sections stay in the draft and are omitted from the snapshot. */
    hidden: boolean;
    /**
     * Stable across saves. The editor MUST send this back for a section it did
     * not just create: it is what a reviewer's note is pinned to, and a save
     * that dropped it would silently detach every note on the page.
     */
    key: string;
}

/** A page's editable DRAFT version + its ordered sections. */
export interface PageDraftView {
    pageId: string;
    pageVersionId: string;
    status: "DRAFT";
    sections: DraftSectionView[];
    /**
     * How many sections publishing the whole site would change (#190), as of
     * this save. Site-wide, not page-wide: the editor's top bar speaks for the
     * site, and a merchant who edited two pages wants one number.
     *
     * Returned from the SAVE rather than recomputed in the browser so there is
     * exactly one definition of the count. That leaves it a few seconds stale
     * while the merchant is mid-keystroke, which costs nothing: Publish is
     * disabled while the draft is dirty, so the number is only ever acted on
     * when it is current, and the autosave pill is what answers "is my work
     * safe" in the meantime.
     *
     * Null when the site has never been published — there is nothing to diff
     * against, and the button says "Publish site" rather than a count.
     */
    pendingSectionChanges: number | null;
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
/**
 * One past publish, as the version-history screens read it.
 *
 * `snapshot` is typed `unknown` rather than Prisma's JsonValue on purpose: the
 * inferred type cannot be named across the package boundary, and callers must
 * parse it against the section contract anyway rather than trusting its shape.
 */
/** One site as the editor and settings screens read it. */
export interface SiteDetailView {
    id: string;
    name: string;
    slug: string;
    subdomain: string | null;
    currentPublicationId: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    socialImageUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    currentPublication: { publishedAt: Date } | null;
    pages: { id: string; path: string; title: string; isHome: boolean }[];
    /**
     * How many sections publishing would change (#190). Null before the first
     * publish. See {@link SitesService.pendingSectionChanges} — every surface
     * that shows this number reads this one computation.
     */
    pendingSectionChanges: number | null;
    /** Always complete — absent choices are filled from the defaults. */
    style: SiteStyle;
    /**
     * The palette and slider bounds. Sent with the site so the editor can
     * resolve a choice locally as a slider moves, without carrying its own copy
     * of the values that could drift from the server's.
     */
    styleOptions: SiteStyleOptions;
}

export interface PublicationDetail {
    id: string;
    publishedAt: Date;
    publishedByUserId: string | null;
    templateId: string;
    templateVersion: number;
    snapshot: unknown;
}

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
                                        // Minted here so a section has a stable
                                        // identity from the moment it exists.
                                        key: newSectionKey(),
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
     * `pendingSectionChanges` is the real count, not a boolean — the same one
     * the editor and settings show, from the same
     * {@link pendingSectionChanges} computation. The earlier note here argued a
     * count would risk disagreeing with the editor's; the answer to that was to
     * have one count rather than to withhold it.
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
            },
        });

        /*
         * The list is where a merchant decides which site needs them (#191), so
         * it carries the same count the editor and settings show rather than a
         * bare "has changes". One extra query for the whole page — sites per org
         * are a handful, not a feed.
         */
        const pending = await this.pendingSectionChanges(
            sites.map((s) => s.id),
        );

        return sites.map(({ claimedDomains, ...site }) => {
            /*
             * Null before the first publish: unpublished work only means
             * something once there is something to compare against, and until
             * then the site's state is "never published", which says more.
             */
            const pendingSectionChanges = pending.get(site.id) ?? null;
            return {
                ...site,
                pendingSectionChanges,
                /*
                 * Derived from the diff, not from a timestamp.
                 *
                 * This used to compare the latest DRAFT `PageVersion.updatedAt`
                 * against `publishedAt`, which never fired: saving a draft
                 * replaces the page's Section rows and does not touch the
                 * PageVersion row, so its `updatedAt` sat at whenever the
                 * version was created. A merchant with a week of unpublished
                 * work saw a list that said "Live" — the exact over-claim #191
                 * exists to remove.
                 */
                hasUnpublishedChanges: (pendingSectionChanges ?? 0) > 0,
                pendingDomain:
                    claimedDomains.find((d) => d.status !== "VERIFIED")
                        ?.hostname ?? null,
            };
        });
    }

    /**
     * How many sections publishing would change, per site (#190, #191).
     *
     * `null` for a site that has never published: there is no baseline to diff
     * against, and "never published" is a stronger thing to say than any number
     * — that site does not exist to the public at all.
     *
     * The query mirrors {@link publishSite}'s exactly — latest DRAFT version by
     * `createdAt`, visible sections only, in `order` — because the count is a
     * diff against the snapshot publish would write. Any divergence here shows
     * up as a number the merchant cannot reconcile with what publishing does.
     */
    private async pendingSectionChanges(
        siteIds: string[],
    ): Promise<Map<string, number | null>> {
        const byId = new Map<string, number | null>();
        if (siteIds.length === 0) return byId;

        const sites = await prisma.site.findMany({
            where: { id: { in: siteIds } },
            select: {
                id: true,
                currentPublication: { select: { snapshot: true } },
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
                                    where: { hidden: false },
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

        for (const site of sites) {
            byId.set(
                site.id,
                site.currentPublication === null
                    ? null
                    : countPendingSectionChanges(
                          toPendingPages(site.pages),
                          site.currentPublication.snapshot,
                      ),
            );
        }
        return byId;
    }

    /**
     * Fetch one of the org's sites with its pages. 404 if it does not exist or
     * belongs to another org (cross-tenant reads are indistinguishable from
     * "not found"). Requires `site:read`.
     */
    async getSite(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<SiteDetailView> {
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
                // The site's look (#189) and its search + social (#188).
                style: true,
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
        // Normalize the look on the way out (#189): the editor should never
        // have to decide what a half-written or absent style means, and a
        // client filling gaps itself is how the preview and the published site
        // drift apart.
        const { style, ...rest } = site;
        const pending = await this.pendingSectionChanges([site.id]);
        return {
            ...rest,
            /*
             * What publishing would change (#190). The editor's top bar and the
             * settings screen both render this, so neither computes its own —
             * the whole point of the number is that a merchant can read it in
             * two places and get the same answer.
             */
            pendingSectionChanges: pending.get(site.id) ?? null,
            style: parseSiteStyle(style),
            styleOptions: siteStyleOptions(),
        };
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

    /**
     * Set a site's look (#189).
     *
     * Replaces rather than merges: the Style panel edits a whole look at once
     * and always sends a complete one, and a partial merge would let two open
     * tabs produce a palette neither person chose.
     *
     * Requires `site:update` — this is what the public sees. Like the search
     * settings, it is draft state: it reaches the live site on the next publish.
     */
    async updateStyle(
        ctx: OrganizationContext,
        siteId: string,
        input: unknown,
    ): Promise<{ id: string; style: SiteStyle }> {
        authorize(ctx, "site:update");
        await this.assertSiteInOrg(ctx, siteId);

        // Validate BEFORE writing: an unknown colour key or a non-numeric
        // slider must be a 400, not a site that renders wrong later.
        const style = parseSiteStyle(input);

        await prisma.site.update({
            where: { id: siteId },
            data: { style: style as unknown as Prisma.InputJsonValue },
            select: { id: true },
        });
        return { id: siteId, style };
    }

    // -----------------------------------------------------------------------
    // Version history (#194) — every publish is already kept
    // -----------------------------------------------------------------------

    /**
     * Every publish of a site, newest first.
     *
     * `Publication` has been immutable and append-only since Stage 2 —
     * republishing inserts a row, never updates one — so this history already
     * existed and simply had no surface. Requires `site:read`.
     *
     * The snapshot itself is deliberately NOT selected: these rows are whole
     * rendered sites, and a list of ten would be megabytes for a screen that
     * shows dates.
     */
    async listPublications(ctx: OrganizationContext, siteId: string) {
        authorize(ctx, "site:read");
        const site = await this.assertSiteInOrg(ctx, siteId);

        const publications = await prisma.publication.findMany({
            where: { siteId, organizationId: ctx.organizationId },
            orderBy: { publishedAt: "desc" },
            select: {
                id: true,
                publishedAt: true,
                publishedByUserId: true,
                templateId: true,
                templateVersion: true,
            },
        });

        return publications.map((p) => ({
            ...p,
            // Which one the public is actually being served. Marked rather than
            // implied by position: after a restore the live version is NOT the
            // newest by content, only by publish time.
            isCurrent: p.id === site.currentPublicationId,
        }));
    }

    /** One past publish, with its snapshot, for previewing. Requires `site:read`. */
    async getPublication(
        ctx: OrganizationContext,
        siteId: string,
        publicationId: string,
    ): Promise<PublicationDetail> {
        authorize(ctx, "site:read");
        await this.assertSiteInOrg(ctx, siteId);

        const publication = await prisma.publication.findFirst({
            where: {
                id: publicationId,
                siteId,
                organizationId: ctx.organizationId,
            },
            select: {
                id: true,
                publishedAt: true,
                publishedByUserId: true,
                templateId: true,
                templateVersion: true,
                snapshot: true,
            },
        });
        if (!publication) {
            throw new NotFoundException(
                `Publication "${publicationId}" not found`,
            );
        }
        return publication;
    }

    /**
     * Put a past version back (#194).
     *
     * APPENDS rather than reverts: a new Publication is inserted carrying the
     * chosen snapshot, and the site points at it. Nothing is deleted, so the
     * history stays complete and a restore can itself be restored — which is the
     * property that makes rolling back safe to try.
     *
     * The DRAFT is untouched. A merchant restoring last week's site may have
     * unrelated work in progress, and silently overwriting it would trade one
     * lost publish for another.
     *
     * Requires `site:publish`: this changes what the public sees, which is the
     * same act as publishing.
     */
    async restorePublication(
        ctx: OrganizationContext,
        siteId: string,
        publicationId: string,
    ) {
        authorize(ctx, "site:publish");
        await this.assertSiteInOrg(ctx, siteId);

        const source = await prisma.publication.findFirst({
            where: {
                id: publicationId,
                siteId,
                organizationId: ctx.organizationId,
            },
            select: {
                snapshot: true,
                templateId: true,
                templateVersion: true,
                pageId: true,
                path: true,
            },
        });
        if (!source) {
            throw new NotFoundException(
                `Publication "${publicationId}" not found`,
            );
        }

        return prisma.$transaction(async (tx) => {
            const restored = await tx.publication.create({
                data: {
                    siteId,
                    organizationId: ctx.organizationId,
                    pageId: source.pageId,
                    path: source.path,
                    snapshot: source.snapshot as Prisma.InputJsonValue,
                    templateId: source.templateId,
                    templateVersion: source.templateVersion,
                    publishedByUserId: ctx.userId,
                },
                select: { id: true, publishedAt: true },
            });
            await tx.site.update({
                where: { id: siteId },
                data: { currentPublicationId: restored.id },
            });
            return {
                publicationId: restored.id,
                publishedAt: restored.publishedAt,
            };
        });
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
                hidden: true,
                key: true,
            },
        });
        const pending = await this.pendingSectionChanges([siteId]);
        return {
            pageId,
            pageVersionId: version.id,
            status: "DRAFT",
            sections,
            // The editor's first read of the count, before any autosave.
            pendingSectionChanges: pending.get(siteId) ?? null,
        };
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
        const seenKeys = new Set<string>();
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
                // Absent means visible — see DraftSectionInputDto.hidden.
                hidden: section.hidden ?? false,
                /*
                 * An absent key means a section the editor has just added, so
                 * one is minted. A present key is carried through untouched:
                 * that is the whole point — this row is about to be deleted and
                 * recreated, and the key is what survives it.
                 *
                 * A REPEATED key is minted afresh. Keys are unique per page
                 * version, so a duplicate would fail the whole save at the
                 * database — and the case that produces one (duplicating a
                 * section) should give the copy its own identity anyway, not
                 * inherit the original's notes.
                 */
                key: claimKey(seenKeys, section.key),
            };
        });

        const draft = await prisma.$transaction(async (tx) => {
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
                        hidden: s.hidden,
                        key: s.key,
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
                    hidden: true,
                    key: true,
                },
            });
            return {
                pageId,
                pageVersionId: version.id,
                status: "DRAFT" as const,
                sections,
            };
        });

        /*
         * Recount AFTER the transaction commits — this reads through `prisma`,
         * not `tx`, so inside it the sections it is counting would not exist
         * yet. The editor's top bar reads this, which is how the number stays
         * true across a session without the browser ever computing its own.
         */
        const pending = await this.pendingSectionChanges([siteId]);
        return {
            ...draft,
            pendingSectionChanges: pending.get(siteId) ?? null,
        };
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
                style: true,
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
                                // Hidden sections do not travel. The snapshot
                                // IS the published site, so filtering here —
                                // rather than in the renderer — means a parked
                                // section cannot leak through a later reader
                                // that forgets to check the flag.
                                sections: {
                                    where: { hidden: false },
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
                    /*
                     * Defensive: a draft section should already be
                     * contract-valid, but publish is the last gate before an
                     * immutable write.
                     *
                     * Parsing and SANITIZING the contract-flagged rich fields
                     * (e.g. richText.value) happens in `toPublishableSection`,
                     * which the pending-change count also calls. That shared
                     * call is deliberate: the count is a diff against this
                     * snapshot, so it has to be computed over the same bytes
                     * this writes, not over the raw draft.
                     */
                    const result = toPublishableSection(section);
                    if (!result.ok) {
                        throw new BadRequestException(
                            `Cannot publish: page "${page.path}" has an invalid "${section.type}" section (${result.error})`,
                        );
                    }
                    return result.section;
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
                // The look travels with the content (#189). saroh.app's
                // SiteTheme already says it will interpolate brand fields from
                // the snapshot when they arrive — these are those fields.
                // Normalized here so a snapshot is always complete, never
                // half-styled by whatever the draft happened to hold.
                style: parseSiteStyle(site.style),
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
                    // Through `unknown`: SiteStyle is a precise interface, and
                    // Prisma's InputJsonValue index signature does not accept
                    // one directly even though the value is plain JSON.
                    snapshot: snapshot as unknown as Prisma.InputJsonValue,
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
    // -----------------------------------------------------------------------
    // Review — notes pinned to sections, and one approval (#193)
    // -----------------------------------------------------------------------

    /**
     * Every note on a site, newest first, with the section each is about
     * resolved against the CURRENT draft.
     *
     * A note whose section is gone comes back with `orphaned: true` rather than
     * being filtered out. Someone wrote it, nobody acted on it, and the section
     * it was about was deleted — dropping it would lose exactly the feedback
     * that most needs seeing.
     */
    async listComments(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<CommentView[]> {
        authorize(ctx, "site:read");
        await this.assertSiteInOrg(ctx, siteId);

        const [comments, pages] = await Promise.all([
            prisma.siteComment.findMany({
                where: { siteId, organizationId: ctx.organizationId },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    pageId: true,
                    sectionKey: true,
                    body: true,
                    resolvedAt: true,
                    createdAt: true,
                    author: { select: { id: true, name: true, email: true } },
                },
            }),
            prisma.page.findMany({
                where: { siteId, organizationId: ctx.organizationId },
                select: {
                    id: true,
                    title: true,
                    versions: {
                        where: { status: "DRAFT" },
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { sections: { select: { key: true } } },
                    },
                },
            }),
        ]);

        // Which section keys still exist, per page.
        const live = new Map<string, Set<string>>(
            pages.map((page) => [
                page.id,
                new Set(
                    page.versions.flatMap((v) => v.sections.map((x) => x.key)),
                ),
            ]),
        );
        const titles = new Map(pages.map((p) => [p.id, p.title]));

        return comments.map((c) => ({
            id: c.id,
            pageId: c.pageId,
            pageTitle: titles.get(c.pageId) ?? null,
            sectionKey: c.sectionKey,
            body: c.body,
            resolvedAt: c.resolvedAt,
            createdAt: c.createdAt,
            author: {
                id: c.author.id,
                // A name is nicer, but an email always exists.
                name: c.author.name ?? c.author.email,
            },
            orphaned: !(live.get(c.pageId)?.has(c.sectionKey) ?? false),
        }));
    }

    /**
     * Leave a note. Requires `site:comment` — the action a REVIEWER has and a
     * MEMBER does not, because leaving a note is not a read.
     */
    async createComment(
        ctx: OrganizationContext,
        siteId: string,
        dto: CreateCommentDto,
    ): Promise<{ id: string }> {
        authorize(ctx, "site:comment");
        await this.assertSiteInOrg(ctx, siteId);
        await this.assertPageInSite(ctx, siteId, dto.pageId);

        const comment = await prisma.siteComment.create({
            data: {
                siteId,
                pageId: dto.pageId,
                organizationId: ctx.organizationId,
                sectionKey: dto.sectionKey,
                authorUserId: ctx.userId,
                body: dto.body,
            },
            select: { id: true },
        });
        return comment;
    }

    /**
     * Mark a note settled, or reopen it. Requires `section:write` — resolving
     * is the OWNER's call, not the reviewer's: the spec has the owner confirm
     * a note is addressed after editing the section it was about.
     *
     * Idempotent in both directions, so a double click does not toggle a note
     * the merchant meant to close back open.
     */
    async setCommentResolved(
        ctx: OrganizationContext,
        siteId: string,
        commentId: string,
        resolved: boolean,
    ): Promise<{ id: string; resolvedAt: Date | null }> {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);

        const existing = await prisma.siteComment.findFirst({
            where: {
                id: commentId,
                siteId,
                organizationId: ctx.organizationId,
            },
            select: { id: true },
        });
        if (!existing) {
            throw new NotFoundException(`Note "${commentId}" not found`);
        }

        return prisma.siteComment.update({
            where: { id: commentId },
            data: {
                resolvedAt: resolved ? new Date() : null,
                resolvedByUserId: resolved ? ctx.userId : null,
            },
            select: { id: true, resolvedAt: true },
        });
    }

    /**
     * Record a reviewer's verdict. Requires `site:approve`.
     *
     * Appended, never updated: "approved, then changes requested, then approved
     * again" is a history worth being able to read, and a single row that
     * flipped would erase it.
     */
    async createApproval(
        ctx: OrganizationContext,
        siteId: string,
        dto: CreateApprovalDto,
    ): Promise<{ id: string }> {
        authorize(ctx, "site:approve");
        await this.assertSiteInOrg(ctx, siteId);

        return prisma.siteApproval.create({
            data: {
                siteId,
                organizationId: ctx.organizationId,
                byUserId: ctx.userId,
                outcome: dto.outcome,
            },
            select: { id: true },
        });
    }

    /**
     * The site's review state: the latest verdict and how many notes are still
     * open. Together these are the spec's "approved with notes" — one badge
     * carrying both, rather than a third outcome.
     */
    async getReviewState(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<ReviewState> {
        authorize(ctx, "site:read");
        await this.assertSiteInOrg(ctx, siteId);

        const [latest, openNotes] = await Promise.all([
            prisma.siteApproval.findFirst({
                where: { siteId, organizationId: ctx.organizationId },
                orderBy: { createdAt: "desc" },
                select: {
                    outcome: true,
                    createdAt: true,
                    by: { select: { name: true, email: true } },
                },
            }),
            prisma.siteComment.count({
                where: {
                    siteId,
                    organizationId: ctx.organizationId,
                    resolvedAt: null,
                },
            }),
        ]);

        return {
            openNotes,
            latestApproval:
                latest === null
                    ? null
                    : {
                          outcome: latest.outcome,
                          at: latest.createdAt,
                          by: latest.by.name ?? latest.by.email,
                      },
        };
    }

    // -----------------------------------------------------------------------
    // Flags — the pre-publish check (advisory, never blocking)
    // -----------------------------------------------------------------------

    /**
     * Every flag on a site. Requires `site:read` — this reports, it does not
     * change anything, and a MEMBER who can see the site can see what is wrong
     * with it.
     *
     * Computed across EVERY page, not just the one the editor has open: the
     * pre-publish check groups flags by page, and "is this site ready" is not a
     * question one page can answer.
     */
    async getSiteFlags(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<{ flags: Flag[]; awaitingNavigation: readonly FlagType[] }> {
        authorize(ctx, "site:read");

        const site = await prisma.site.findFirst({
            where: {
                id: siteId,
                organizationId: ctx.organizationId,
                deletedAt: null,
            },
            select: {
                seoDescription: true,
                currentPublicationId: true,
                currentPublication: { select: { publishedAt: true } },
                pages: {
                    select: {
                        id: true,
                        path: true,
                        title: true,
                        versions: {
                            where: { status: "DRAFT" },
                            orderBy: { createdAt: "desc" },
                            take: 1,
                            select: {
                                updatedAt: true,
                                sections: {
                                    orderBy: { order: "asc" },
                                    select: {
                                        type: true,
                                        content: true,
                                        hidden: true,
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

        const publishedAt = site.currentPublication?.publishedAt ?? null;
        const hasUnpublishedChanges =
            publishedAt !== null &&
            site.pages.some((page) =>
                page.versions.some((v) => v.updatedAt > publishedAt),
            );

        const flags = checkSite({
            seoDescription: site.seoDescription,
            published: site.currentPublicationId !== null,
            hasUnpublishedChanges,
            pages: site.pages.map((page) => ({
                id: page.id,
                path: page.path,
                title: page.title,
                // `versions` is the latest draft or empty; a page with no draft
                // has no sections to check rather than being an error.
                sections: page.versions.flatMap((v) => v.sections),
            })),
        });

        // The two unimplementable types travel with the result so the editor
        // can say what is NOT being checked rather than implying nine.
        return { flags, awaitingNavigation: FLAGS_AWAITING_NAVIGATION };
    }

    // -----------------------------------------------------------------------
    // Pages — a site is more than its home page
    // -----------------------------------------------------------------------

    /**
     * Add a page to a site. Requires `site:update` — adding a page changes what
     * the site IS, which is an owner/admin decision, not a content edit.
     *
     * The new page starts with no sections at all rather than a copied
     * template. A page pre-filled with someone else's hero is a page the
     * merchant has to empty before they can start.
     */
    async createPage(
        ctx: OrganizationContext,
        siteId: string,
        dto: CreatePageDto,
    ): Promise<PageView> {
        authorize(ctx, "site:update");
        await this.assertSiteInOrg(ctx, siteId);

        // "/" is the home page's path and the home page already exists. Caught
        // here so the merchant is told what is wrong rather than being handed
        // a unique-constraint violation.
        if (dto.path === "/") {
            throw new BadRequestException(
                "The path / already belongs to this site's home page. Choose another, for example /about.",
            );
        }
        await this.assertPathIsFree(siteId, dto.path);

        const page = await prisma.page.create({
            data: {
                siteId,
                organizationId: ctx.organizationId,
                path: dto.path,
                title: dto.title,
                isHome: false,
            },
            select: { id: true, path: true, title: true, isHome: true },
        });
        return page;
    }

    /**
     * Rename a page, move it, or both. Requires `site:update`.
     *
     * The home page can be renamed but NOT moved: "/" is where visitors land,
     * and a home page at /welcome is a site with no front door.
     */
    async updatePage(
        ctx: OrganizationContext,
        siteId: string,
        pageId: string,
        dto: UpdatePageDto,
    ): Promise<PageView> {
        authorize(ctx, "site:update");
        await this.assertSiteInOrg(ctx, siteId);

        const page = await prisma.page.findFirst({
            where: { id: pageId, siteId, organizationId: ctx.organizationId },
            select: { id: true, path: true, isHome: true },
        });
        if (!page) {
            throw new NotFoundException(`Page "${pageId}" not found`);
        }

        if (dto.path !== undefined && dto.path !== page.path) {
            if (page.isHome) {
                throw new BadRequestException(
                    "The home page has to stay at /. Rename it if you want it called something else.",
                );
            }
            if (dto.path === "/") {
                throw new BadRequestException(
                    "The path / already belongs to this site's home page.",
                );
            }
            await this.assertPathIsFree(siteId, dto.path);
        }

        return prisma.page.update({
            where: { id: pageId },
            data: {
                // ABSENT means leave alone, so each field is set only when sent.
                ...(dto.title === undefined ? {} : { title: dto.title }),
                ...(dto.path === undefined ? {} : { path: dto.path }),
            },
            select: { id: true, path: true, title: true, isHome: true },
        });
    }

    /**
     * Delete a page and everything under it. Requires `site:update`.
     *
     * The home page cannot be deleted: a site with no home page has nothing to
     * serve at its own address, and the editor picks the home page to open.
     *
     * This cascades to the page's versions and their sections (schema
     * `onDelete: Cascade`), so it destroys authored content. It does NOT touch
     * publications: a page already published stays in every existing immutable
     * snapshot and only disappears from the live site at the next publish,
     * which is what makes the change reviewable before it ships.
     */
    async deletePage(
        ctx: OrganizationContext,
        siteId: string,
        pageId: string,
    ): Promise<{ deleted: true }> {
        authorize(ctx, "site:update");
        await this.assertSiteInOrg(ctx, siteId);

        const page = await prisma.page.findFirst({
            where: { id: pageId, siteId, organizationId: ctx.organizationId },
            select: { id: true, isHome: true },
        });
        if (!page) {
            throw new NotFoundException(`Page "${pageId}" not found`);
        }
        if (page.isHome) {
            throw new BadRequestException(
                "The home page cannot be deleted — it is what this site's address serves.",
            );
        }

        await prisma.page.delete({ where: { id: pageId } });
        return { deleted: true };
    }

    /** Refuse a path another page on this site already holds. */
    private async assertPathIsFree(siteId: string, path: string) {
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

    private async assertSiteInOrg(
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
