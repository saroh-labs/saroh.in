import {
    BadRequestException,
    ConflictException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from "@nestjs/common";
import {
    getSectionContract,
    parseSectionContent,
    Prisma,
    prisma,
} from "@saroh/database";
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
import { parsePostsPrefix } from "../content/posts-prefix";
import { authorize, can } from "../organizations/organization-policy";
import type {
    CreateApprovalDto,
    CreateCommentDto,
    CreatePageDto,
    CreateSiteFromTemplateDto,
    UpdateDraftSectionsDto,
    UpdatePageDto,
    UpdateSiteSettingsDto,
} from "./dto";
import type { SiteChangeKind } from "./pending-changes";
import {
    countPendingSectionChanges,
    pagePathResolver,
    pendingSiteChanges,
    toPendingPages,
    toPublishableSection,
} from "./pending-changes";
import type { Renderability } from "./publication-renderability";
import { checkRenderability } from "./publication-renderability";
import type { ApprovalRow, ReviewRoute } from "./review-route";
import { draftFingerprint, reviewStanding } from "./review-route";
import { sanitizeRichHtml, sanitizeSectionContent } from "./sanitize";
import {
    assertPageInSite,
    assertPathIsFree,
    assertSiteInOrg,
    buildTemplateContext,
    getOrCreateDraftVersion,
    reviewerScope,
} from "./site-access";
import type { Flag, FlagType } from "./site-flags";
import { checkSite, FLAGS_AWAITING_NAVIGATION } from "./site-flags";
import type { SiteFooter } from "./site-footer";
import { parseSiteFooter } from "./site-footer";
import type { SiteNavigation } from "./site-navigation";
import { parseSiteNavigation, resolveSiteNavigation } from "./site-navigation";
import type { SiteStyle, SiteStyleOptions } from "./site-style";
import {
    parseSiteStyle,
    siteStyleOptions,
    siteStyleVariables,
} from "./site-style";

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
    /** Null once the page it was left on has been deleted (#277). */
    pageId: string | null;
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
    /** A review has been asked for and nobody has answered it yet (#278). */
    pending: boolean;
    /**
     * The newest approval was of a different draft than the one that would go
     * live now — someone approved, then the work carried on (#278).
     */
    approvalIsStale: boolean;
    /**
     * The latest event of any kind — a reviewer's verdict, or a BYPASSED row
     * publish wrote (#199). What the badge shows.
     */
    latestApproval: { outcome: string; at: Date; by: string } | null;
    /**
     * True while a reviewer's most recent VERDICT is CHANGES_REQUESTED and no
     * approval has followed it (#199). Publishing then still succeeds, and is
     * recorded as a bypass. A site nobody asked to review is not outstanding —
     * it is unreviewed, which is the normal state and must not nag.
     */
    outstanding: boolean;
}

/** A page as returned by the page endpoints and by getSite. */
export interface PageView {
    id: string;
    path: string;
    title: string;
    isHome: boolean;
    /** Hidden pages stay in the draft and are omitted from the snapshot. */
    hidden: boolean;
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
    /**
     * Which site-level settings publishing would change (#282): search, share
     * image, style, menu, footer, page list. Null before the first publish.
     */
    pendingSiteChanges: SiteChangeKind[] | null;
}

/** What a publish returns: the new immutable Publication + the live pointer. */
export interface PublishResult {
    publicationId: string;
    publishedAt: Date;
    currentPublicationId: string;
    /** True when this publish went past an outstanding change request (#199). */
    bypassed: boolean;
}

/**
 * What a Publication row's `snapshot` holds, and what a draft preview serves
 * (#198). Loose on purpose at this boundary: the renderer types it on its
 * side, and the shape is settled by `buildSnapshot`, not by this alias.
 */
export type SiteSnapshot = Record<string, unknown> & {
    site: Record<string, unknown> & { name: string; slug: string };
    pages: unknown[];
    publishedAt: string;
};

/** The public read contract: only the current, immutable Publication snapshot. */
export interface PublicSiteView {
    snapshot: unknown;
    publishedAt: Date;
    /**
     * The site this snapshot belongs to (#232). The renderer resolves a host
     * once and then asks for that site's posts by id, rather than every post
     * route repeating the subdomain-or-custom-hostname resolution.
     */
    siteId?: string;
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
/**
 * What this caller may do with this site (#275).
 *
 * Computed here with `can()`, and sent, so the app never mirrors
 * `organization-policy.ts`. A screen that decides for itself which buttons a
 * role gets is a second policy, and the two drift: today every website surface
 * renders Save, Restore, Create link and Connect to roles the API refuses, so
 * the first press is where a merchant learns they cannot.
 *
 * This is for rendering, never for enforcement — the API still authorizes every
 * call. A control that is absent because of this cannot be pressed; one that is
 * reached anyway is still refused.
 */
export interface SiteCapabilities {
    /** Load and write editable drafts: the editor's whole premise. */
    edit: boolean;
    /** Put the site, or a past version of it, in front of the public. */
    publish: boolean;
    /** Leave a note on a section. */
    comment: boolean;
    /** Record a verdict on the site. */
    approve: boolean;
    /** Change the site's name, search, style, menu and footer. */
    manageSettings: boolean;
    /** Claim or connect a domain. */
    manageDomain: boolean;
}

/**
 * A page as a REVIEWER reads it (#275): the sections, in order, with what they
 * say.
 *
 * Not the editor's draft. `getPageDraft` requires `section:write` and creates a
 * DRAFT version if the page has none — it is an authoring load, and a reviewer
 * is not authoring. This one requires `site:read`, writes nothing, and returns
 * what the sections contain so the same blocks the live site uses can draw
 * them.
 *
 * It carries each section's key because that is what a note is pinned to, and
 * a reviewer with no key has nothing to pin to.
 */
export interface ReviewablePage {
    sections: {
        key: string;
        type: string;
        contractVersion: number;
        /** A few words naming the section, for a list that has two heroes. */
        label: string | null;
        /** Hidden sections are shown, marked: they are part of the draft. */
        hidden: boolean;
        content: unknown;
    }[];
}

/** One site as the editor and settings screens read it. */
export interface SiteDetailView {
    /** Whether this caller may load and write editable drafts. */
    canEdit: boolean;
    /** Everything this caller may do here, decided by the policy (#275). */
    can: SiteCapabilities;
    id: string;
    name: string;
    slug: string;
    subdomain: string | null;
    currentPublicationId: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    socialImageUrl: string | null;
    socialImageWidth: number | null;
    socialImageHeight: number | null;
    socialImageBytes: number | null;
    /** Where this site's posts live (#232); null means the default. */
    postsPrefix: string | null;
    createdAt: Date;
    updatedAt: Date;
    currentPublication: { publishedAt: Date } | null;
    pages: {
        id: string;
        path: string;
        title: string;
        isHome: boolean;
        /** Hidden pages stay in the draft and never reach the snapshot (#197). */
        hidden: boolean;
    }[];
    /**
     * How many sections publishing would change (#190). Null before the first
     * publish. See {@link SitesService.pendingSectionChanges} — every surface
     * that shows this number reads this one computation.
     */
    pendingSectionChanges: number | null;
    /**
     * Which site-level settings publishing would change (#282): search, share
     * image, style, menu, footer, page list. Null before the first publish.
     */
    pendingSiteChanges: SiteChangeKind[] | null;
    /** Always complete — absent choices are filled from the defaults. */
    style: SiteStyle;
    /**
     * What the merchant wrote at the foot of their site (#202). Null means they
     * have written nothing, and nothing is what renders — not an empty band in
     * the footer colour.
     */
    footer: SiteFooter | null;
    /** The site's menu (#206), by page id. Null until one is built. */
    navigation: SiteNavigation | null;
    /**
     * The palette and slider bounds. Sent with the site so the editor can
     * resolve a choice locally as a slider moves, without carrying its own copy
     * of the values that could drift from the server's.
     */
    styleOptions: SiteStyleOptions;
}

/**
 * Version history means the SITE's publishes, not every row in the table.
 *
 * Publishing a blog post writes a Publication too (`postId` set, `templateId`
 * "post", a snapshot holding one post and no pages). Those rows were reaching
 * version history, where they read as ordinary site versions: an undated-looking
 * entry a merchant could restore, which would point `currentPublicationId` at a
 * snapshot with no pages and take the live site down. A post publish is not a
 * version of the site, so it is not offered as one — restoring one is a 404, not
 * a broken home page.
 */
const SITE_VERSION = { postId: null } as const;

export interface PublicationDetail {
    id: string;
    publishedAt: Date;
    publishedByUserId: string | null;
    /** Who published it: their name, else their email; null if unknown (#283). */
    publishedBy: string | null;
    templateId: string;
    templateVersion: number;
    snapshot: unknown;
    /** Whether this build can still draw every section it holds (#283). */
    renderability: Renderability;
}

/**
 * Everything a snapshot is built from: the site's draft, visible pages and
 * their visible draft sections. Shared by publish and by draft previews
 * (#198), so a preview shows exactly what publish would write.
 */
const draftSiteSelect = {
    id: true,
    name: true,
    slug: true,
    postsPrefix: true,
    style: true,
    seoTitle: true,
    seoDescription: true,
    socialImageUrl: true,
    socialImageWidth: true,
    socialImageHeight: true,
    socialImageBytes: true,
    footer: true,
    navigation: true,
    pages: {
        // A hidden page does not travel, for the same reason a
        // hidden section does not: a Publication is immutable once
        // written, so a page that leaked in could not be taken back
        // out without republishing.
        where: { hidden: false },
        orderBy: { path: "asc" },
        select: {
            id: true,
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
} satisfies Prisma.SiteSelect;

/** A site as {@link draftSiteSelect} loads it. */
type DraftSite = Prisma.SiteGetPayload<{ select: typeof draftSiteSelect }>;

/** What publishing a site would change (#190, #282). */
interface PendingChanges {
    /** How many sections would be added, removed or changed. */
    sections: number;
    /** Which site-level settings differ from what is live. */
    site: SiteChangeKind[];
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

        const context = await buildTemplateContext(ctx.organizationId);

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
            where: {
                organizationId: ctx.organizationId,
                deletedAt: null,
                // A reviewer's list holds only the sites they were invited to
                // (#276) — not "every site, greyed out".
                ...reviewerScope(ctx),
            },
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
            const changes = pending.get(site.id) ?? null;
            const pendingSectionChanges = changes?.sections ?? null;
            const pendingSiteChanges = changes?.site ?? null;
            return {
                ...site,
                pendingSectionChanges,
                pendingSiteChanges,
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
                hasUnpublishedChanges:
                    (pendingSectionChanges ?? 0) > 0 ||
                    (pendingSiteChanges?.length ?? 0) > 0,
                pendingDomain:
                    claimedDomains.find((d) => d.status !== "VERIFIED")
                        ?.hostname ?? null,
            };
        });
    }

    /**
     * What publishing would change, per site (#190, #191, #282): how many
     * sections, and which site-level settings.
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
    ): Promise<Map<string, PendingChanges | null>> {
        const byId = new Map<string, PendingChanges | null>();
        if (siteIds.length === 0) return byId;

        const sites = await prisma.site.findMany({
            where: { id: { in: siteIds } },
            /*
             * Exactly what publish loads (#282). The site block is then built by
             * the same code publish runs, so this diff compares the bytes
             * publishing would actually write, sections and settings alike.
             */
            select: {
                ...draftSiteSelect,
                currentPublication: { select: { snapshot: true } },
            },
        });

        for (const site of sites) {
            if (site.currentPublication === null) {
                byId.set(site.id, null);
                continue;
            }
            const live = site.currentPublication.snapshot;
            const pages = toPendingPages(site.pages);
            // Lenient: counting is a read, and one stale section must not
            // make the sites list throw.
            const draft = this.buildSnapshot(site, new Date(0), {
                lenient: true,
            });
            byId.set(site.id, {
                sections: countPendingSectionChanges(pages, live),
                site: pendingSiteChanges(draft.site, pages, live),
            });
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
                // A reviewer sees the sites they were invited to (#276).
                ...reviewerScope(ctx),
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
                socialImageWidth: true,
                socialImageHeight: true,
                socialImageBytes: true,
                postsPrefix: true,
                footer: true,
                navigation: true,
                createdAt: true,
                updatedAt: true,
                // When the site last went live. Read through the current
                // publication rather than stamped on the Site, so it cannot
                // drift from the publication history it describes.
                currentPublication: { select: { publishedAt: true } },
                pages: {
                    // Not filtered: this is the EDITOR's list, and a merchant
                    // cannot unhide a page they cannot see.
                    orderBy: { path: "asc" },
                    select: {
                        id: true,
                        path: true,
                        title: true,
                        isHome: true,
                        hidden: true,
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
        // drift apart. The footer is normalized here for the same reason — the
        // editor reads back exactly what publish would write.
        const { style, footer, navigation, ...rest } = site;
        const pending = await this.pendingSectionChanges([site.id]);
        return {
            ...rest,
            canEdit: can(ctx.role, "section:write"),
            can: {
                edit: can(ctx.role, "section:write"),
                publish: can(ctx.role, "site:publish"),
                comment: can(ctx.role, "site:comment"),
                approve: can(ctx.role, "site:approve"),
                manageSettings: can(ctx.role, "site:update"),
                manageDomain: can(ctx.role, "domain:manage"),
            },
            /*
             * What publishing would change (#190). The editor's top bar and the
             * settings screen both render this, so neither computes its own —
             * the whole point of the number is that a merchant can read it in
             * two places and get the same answer.
             */
            pendingSectionChanges: pending.get(site.id)?.sections ?? null,
            // The settings that travel into the snapshot too (#282).
            pendingSiteChanges: pending.get(site.id)?.site ?? null,
            style: parseSiteStyle(style),
            styleOptions: siteStyleOptions(),
            footer: parseSiteFooter(footer),
            navigation: parseSiteNavigation(navigation),
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
        await assertSiteInOrg(ctx, siteId);

        const data: {
            seoTitle?: string | null;
            seoDescription?: string | null;
            socialImageUrl?: string | null;
            socialImageWidth?: number | null;
            socialImageHeight?: number | null;
            socialImageBytes?: number | null;
            postsPrefix?: string | null;
        } = {};
        if (dto.seoTitle !== undefined) data.seoTitle = dto.seoTitle;
        if (dto.seoDescription !== undefined)
            data.seoDescription = dto.seoDescription;
        if (dto.socialImageUrl !== undefined)
            data.socialImageUrl = dto.socialImageUrl;
        if (dto.socialImageWidth !== undefined)
            data.socialImageWidth = dto.socialImageWidth;
        if (dto.socialImageHeight !== undefined)
            data.socialImageHeight = dto.socialImageHeight;
        if (dto.socialImageBytes !== undefined)
            data.socialImageBytes = dto.socialImageBytes;
        if (dto.postsPrefix !== undefined) {
            // Checked against this site's own pages: a prefix matching a page
            // path would make one of the two unreachable, and which one won
            // would depend on route order rather than on anything the merchant
            // could see.
            const pages = await prisma.page.findMany({
                where: { siteId },
                select: { path: true },
            });
            data.postsPrefix = parsePostsPrefix(
                dto.postsPrefix,
                pages.map((p) => p.path),
            );
        }

        const site = await prisma.site.update({
            where: { id: siteId },
            data,
            select: {
                id: true,
                seoTitle: true,
                seoDescription: true,
                socialImageUrl: true,
                socialImageWidth: true,
                socialImageHeight: true,
                socialImageBytes: true,
                postsPrefix: true,
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
        await assertSiteInOrg(ctx, siteId);

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

    /**
     * Set a site's footer (#202).
     *
     * Replaces rather than merges, like the style it sits beside: there is one
     * footer and the form always sends the whole of it.
     *
     * Clearing the field IS the delete. `parseSiteFooter` collapses an empty or
     * whitespace-only value to null, so a merchant who empties the box gets no
     * footer element at all rather than an empty coloured band — there is no
     * separate remove action to find.
     *
     * Requires `site:update` — this is what the public sees. Draft state like
     * everything else here: it reaches the live site on the next publish.
     */
    async updateFooter(
        ctx: OrganizationContext,
        siteId: string,
        input: unknown,
    ): Promise<{ id: string; footer: SiteFooter | null }> {
        authorize(ctx, "site:update");
        await assertSiteInOrg(ctx, siteId);

        // Validate BEFORE writing, for the same reason style does: a malformed
        // body is a 400 now rather than a footer that fails to render later.
        const parsed = parseSiteFooter(input);
        // Sanitized on the way IN as well as at publish (#280). Publish is not
        // the only reader of what is stored here, and "safe because publish
        // cleans it" left every other reader trusting HTML nobody had cleaned.
        const footer: SiteFooter | null = parsed
            ? { format: parsed.format, value: sanitizeRichHtml(parsed.value) }
            : null;

        await prisma.site.update({
            where: { id: siteId },
            data: {
                footer:
                    footer === null
                        ? Prisma.DbNull
                        : (footer as unknown as Prisma.InputJsonValue),
            },
            select: { id: true },
        });
        return { id: siteId, footer };
    }

    /**
     * Set the site's menu (#206). Replaces rather than merges, like style and
     * the footer; an empty list clears it. Requires `site:update`. Draft
     * state: it reaches the live site on the next publish.
     */
    async updateNavigation(
        ctx: OrganizationContext,
        siteId: string,
        input: unknown,
    ): Promise<{ id: string; navigation: SiteNavigation | null }> {
        authorize(ctx, "site:update");
        await assertSiteInOrg(ctx, siteId);
        const navigation = parseSiteNavigation(input);
        await prisma.site.update({
            where: { id: siteId },
            data: {
                navigation:
                    navigation === null
                        ? Prisma.DbNull
                        : (navigation as unknown as Prisma.InputJsonValue),
            },
            select: { id: true },
        });
        return { id: siteId, navigation };
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
        const site = await assertSiteInOrg(ctx, siteId);

        const publications = await prisma.publication.findMany({
            where: {
                siteId,
                organizationId: ctx.organizationId,
                ...SITE_VERSION,
            },
            orderBy: { publishedAt: "desc" },
            select: {
                id: true,
                publishedAt: true,
                publishedByUserId: true,
                templateId: true,
                templateVersion: true,
                // Which of the three routes this publish took (#278). Null on
                // rows published before it was recorded.
                reviewRoute: true,
                // Whether this publish went past an outstanding change
                // request (#199): the bypass row names its publication.
                approvals: {
                    where: { outcome: "BYPASSED" },
                    take: 1,
                    select: {
                        createdAt: true,
                        by: { select: { name: true, email: true } },
                    },
                },
            },
        });

        // Names, not ids (#283). "Who put this live" is a question the list
        // exists to answer, and a Publication records only the user id.
        const publishers = await this.userNames(
            publications.map((p) => p.publishedByUserId),
        );

        return publications.map(({ approvals, ...p }) => ({
            ...p,
            publishedBy: p.publishedByUserId
                ? (publishers.get(p.publishedByUserId) ?? null)
                : null,
            bypass:
                approvals.length === 0
                    ? null
                    : {
                          at: approvals[0].createdAt,
                          by: approvals[0].by.name ?? approvals[0].by.email,
                      },
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
        await assertSiteInOrg(ctx, siteId);

        const publication = await prisma.publication.findFirst({
            where: {
                id: publicationId,
                siteId,
                organizationId: ctx.organizationId,
                ...SITE_VERSION,
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
        const publishers = await this.userNames([
            publication.publishedByUserId,
        ]);
        return {
            ...publication,
            publishedBy: publication.publishedByUserId
                ? (publishers.get(publication.publishedByUserId) ?? null)
                : null,
            renderability: checkRenderability(publication.snapshot),
        };
    }

    /**
     * Display names for user ids (#283): a name, else the email every user has.
     * One query for every distinct id, however many versions share a publisher.
     */
    private async userNames(
        ids: (string | null)[],
    ): Promise<Map<string, string>> {
        const unique = [
            ...new Set(ids.filter((id): id is string => id !== null)),
        ];
        if (unique.length === 0) return new Map();
        const users = await prisma.user.findMany({
            where: { id: { in: unique } },
            select: { id: true, name: true, email: true },
        });
        return new Map(users.map((u) => [u.id, u.name ?? u.email]));
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
     * same act as publishing. For the same reason, going live past an
     * outstanding change request is recorded as a bypass, exactly as
     * `publishSite` records it (#279).
     */
    async restorePublication(
        ctx: OrganizationContext,
        siteId: string,
        publicationId: string,
    ) {
        authorize(ctx, "site:publish");
        await assertSiteInOrg(ctx, siteId);

        const source = await prisma.publication.findFirst({
            where: {
                id: publicationId,
                siteId,
                organizationId: ctx.organizationId,
                ...SITE_VERSION,
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

        /*
         * A restore puts a version live, so it is a publish. A publish past an
         * outstanding review is RECORDED, not prevented (#199, #278). This
         * path used to skip the check, so rolling back while a reviewer had
         * asked for changes went live with nothing anywhere saying so (#279).
         *
         * The fingerprint is of the version being restored, because that is
         * what goes live: an approval counts only if a reviewer approved this
         * exact content, which a draft approval almost never is.
         */
        const fingerprint = draftFingerprint(source.snapshot);

        return prisma.$transaction(async (tx) => {
            const standing = await this.reviewStandingFor(
                tx,
                siteId,
                ctx.organizationId,
                fingerprint,
                ctx.userId,
            );
            const bypass = standing.outstanding;

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
                    // A restore is a publish, and says which route it took
                    // (#278) like any other.
                    reviewRoute: standing.route satisfies ReviewRoute,
                },
                select: { id: true, publishedAt: true },
            });
            await tx.site.update({
                where: { id: siteId },
                data: { currentPublicationId: restored.id },
            });
            if (bypass) {
                // Linked to the restored publication, so version history marks
                // this entry the way it marks a bypassed publish.
                await tx.siteApproval.create({
                    data: {
                        siteId,
                        organizationId: ctx.organizationId,
                        byUserId: ctx.userId,
                        outcome: "BYPASSED",
                        publicationId: restored.id,
                    },
                    select: { id: true },
                });
            }
            return {
                publicationId: restored.id,
                publishedAt: restored.publishedAt,
                bypassed: bypass,
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
        await assertSiteInOrg(ctx, siteId);
        await assertPageInSite(ctx, siteId, pageId);

        const version = await getOrCreateDraftVersion(prisma, ctx, pageId);
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
            /*
             * Sanitized on the way OUT as well (#280). The editor's preview
             * renders rich fields as HTML, and a row saved before sanitize-on-
             * write existed, or written by any other path, must not reach it
             * raw. It also cleans the row for good: the editor saves back what
             * it was given.
             */
            sections: sections.map((section) => ({
                ...section,
                content: sanitizeSectionContent(
                    section.content,
                    getSectionContract(section.type, section.contractVersion)
                        ?.sanitizedFields ?? [],
                ) as typeof section.content,
            })),
            // The editor's first read of the count, before any autosave.
            pendingSectionChanges: pending.get(siteId)?.sections ?? null,
            pendingSiteChanges: pending.get(siteId)?.site ?? null,
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
     * value (defaults applied), with the contract's rich fields SANITIZED. Publish
     * sanitizes again, but the editor preview renders what is stored here, so
     * cleaning only at publish left it rendering raw HTML (#280).
     */
    async replaceDraftSections(
        ctx: OrganizationContext,
        siteId: string,
        pageId: string,
        dto: UpdateDraftSectionsDto,
    ): Promise<PageDraftView> {
        authorize(ctx, "section:write");
        await assertSiteInOrg(ctx, siteId);
        await assertPageInSite(ctx, siteId, pageId);

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
                content: sanitizeSectionContent(
                    result.data,
                    result.contract.sanitizedFields,
                ),
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
            const version = await getOrCreateDraftVersion(tx, ctx, pageId);
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
            pendingSectionChanges: pending.get(siteId)?.sections ?? null,
            pendingSiteChanges: pending.get(siteId)?.site ?? null,
        };
    }

    // -----------------------------------------------------------------------
    // Immutable publish (S2-005) — authorize `site:publish`
    // -----------------------------------------------------------------------

    /**
     * The draft as a snapshot would see it, or null when the site does not
     * match `where`. Shared by publish and by draft previews (#198).
     */
    async loadDraftSite(
        where: Prisma.SiteWhereInput,
    ): Promise<DraftSite | null> {
        return prisma.site.findFirst({ where, select: draftSiteSelect });
    }

    /**
     * Build the self-contained, SANITIZED snapshot of a draft. Pure: reads
     * nothing, writes nothing, throws on a section that fails its contract.
     *
     * ONE builder for publish and for preview (#198). A preview built any
     * other way would eventually show a reviewer something publish does not
     * write — a resolved menu, a sanitized footer, a hidden section — and
     * their notes would be about a site that never goes live.
     */
    buildSnapshot(
        site: DraftSite,
        publishedAt: Date,
        /**
         * `lenient` keeps a section that fails its contract instead of
         * throwing (#282). The pending-change count is a read and must not
         * fail; publish is not lenient.
         */
        options: { lenient?: boolean } = {},
    ): SiteSnapshot {
        // v2 buttons name a page by id; the snapshot needs its path (#207).
        // Built from the pages this publish will write, so a hidden page
        // resolves to nothing rather than to a path the live site 404s.
        const resolvePage = pagePathResolver(site.pages);
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
                    const result = toPublishableSection(section, resolvePage);
                    if (!result.ok && options.lenient) {
                        return {
                            type: section.type,
                            contractVersion: section.contractVersion,
                            content: section.content,
                        };
                    }
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

        const publishedStyle = parseSiteStyle(site.style);
        const draftFooter = parseSiteFooter(site.footer);
        /*
         * The footer travels SANITIZED (#202).
         *
         * Same boundary as `richText.value`: authorable HTML is cleaned here,
         * before the immutable write, so the renderer only ever reads content
         * that is already safe and never sanitizes at read time. It runs
         * through the sanitizer whatever the format says, rather than making
         * the safety of a permanent write depend on a string the client sent.
         */
        const publishedFooter: SiteFooter | null = draftFooter
            ? {
                  format: draftFooter.format,
                  value: sanitizeRichHtml(draftFooter.value),
              }
            : null;
        const snapshot: SiteSnapshot = {
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
                // Where this site's posts live (#232). In the snapshot because
                // the renderer routes on it, and a snapshot is the site as it
                // was served: moving the prefix later must not retarget links
                // inside pages already published.
                postsPrefix: site.postsPrefix,
                // The picture with its measurements (#220). WhatsApp draws the
                // large card only when og:image:width/height are present, so
                // a URL alone was a smaller card than the merchant had chosen.
                // `socialImageUrl` stays beside it for snapshots read by an
                // older renderer.
                socialImage: site.socialImageUrl
                    ? {
                          url: site.socialImageUrl,
                          width: site.socialImageWidth,
                          height: site.socialImageHeight,
                      }
                    : null,
                /*
                 * The look travels with the content (#189). Normalized here so
                 * a snapshot is always complete, never half-styled by whatever
                 * the draft happened to hold.
                 *
                 * `style` is the merchant's CHOICES — palette keys and slider
                 * numbers. Kept for provenance and for anything that wants to
                 * know what was picked.
                 */
                style: publishedStyle,
                /*
                 * `styleVariables` is those choices already RESOLVED into the
                 * `--site-*` custom properties the renderer reads.
                 *
                 * Resolved here rather than in the renderer for two reasons.
                 * A Publication is meant to be self-contained, and a renderer
                 * that had to turn "clay" into an HSL triple would need its own
                 * copy of the palette — the exact drift `siteStyleOptions`
                 * exists to prevent, one app further out. And a snapshot is the
                 * site AS IT WAS SERVED: retuning a swatch later should not
                 * silently restyle everything anyone has already published.
                 */
                styleVariables: siteStyleVariables(publishedStyle),
                footer: publishedFooter,
                /*
                 * The menu, RESOLVED (#206): page ids become paths and default
                 * labels, over the pages this publish writes — so a hidden
                 * page's entry is simply absent. Same reason style and button
                 * actions resolve here: the snapshot is the site as served.
                 */
                navigation: resolveSiteNavigation(
                    parseSiteNavigation(site.navigation),
                    site.pages,
                ),
            },
            pages,
            publishedAt: publishedAt.toISOString(),
        };
        return snapshot;
    }

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

        const site = await this.loadDraftSite({
            id: siteId,
            organizationId: ctx.organizationId,
            deletedAt: null,
        });
        if (!site) {
            throw new NotFoundException(`Site "${siteId}" not found`);
        }

        const publishedAt = new Date();
        const snapshot = this.buildSnapshot(site, publishedAt);
        /*
         * Approval gates nothing, and says so (#199, #278). The epic's rule: if
         * a review was asked for and has not been answered for THIS draft,
         * publishing is RECORDED as a bypass, not prevented.
         *
         * The fingerprint is of the snapshot about to be written, so an
         * approval of an earlier draft does not cover this one.
         */
        const fingerprint = draftFingerprint(snapshot);

        // The Site does not track which template produced it; default the
        // Publication's required (non-null) template stamp to the starter
        // template's identity/version.
        return prisma.$transaction(async (tx) => {
            /*
             * Asked INSIDE the transaction (#278). It used to be read before
             * one, so a verdict posted while a publish was in flight was
             * missed — the narrow window in which the record would have been
             * wrong is exactly the window a reviewer racing a publisher falls
             * into.
             */
            const standing = await this.reviewStandingFor(
                tx,
                site.id,
                ctx.organizationId,
                fingerprint,
                ctx.userId,
            );
            const bypass = standing.outstanding;

            const publication = await tx.publication.create({
                data: {
                    siteId: site.id,
                    organizationId: ctx.organizationId,
                    // Which of the three routes this took, so version history
                    // can tell "a reviewer approved it" from "nobody was
                    // asked" (#193).
                    reviewRoute: standing.route satisfies ReviewRoute,
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
            if (bypass) {
                // Appended like every other approval event: "changes
                // requested, then published anyway" reads as history.
                await tx.siteApproval.create({
                    data: {
                        siteId: site.id,
                        organizationId: ctx.organizationId,
                        byUserId: ctx.userId,
                        outcome: "BYPASSED",
                        publicationId: publication.id,
                    },
                    select: { id: true },
                });
            }
            return {
                publicationId: publication.id,
                publishedAt: publication.publishedAt,
                currentPublicationId: publication.id,
                bypassed: bypass,
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
     * Public: resolve a VERIFIED custom hostname to its site's CURRENT
     * publication (#200). Ownership was proven by DNS before the row reached
     * VERIFIED, and only a VERIFIED row routes — a PENDING claim on someone
     * else's hostname resolves nothing. Same read guarantees as
     * {@link getPublicationBySubdomain}.
     */
    async getPublicationByHostname(hostname: string): Promise<PublicSiteView> {
        const domain = await prisma.domain.findUnique({
            where: { hostname: hostname.trim().toLowerCase() },
            select: { status: true, siteId: true },
        });
        if (domain?.status !== "VERIFIED" || !domain.siteId) {
            throw new NotFoundException(
                `No published site found for hostname "${hostname}"`,
            );
        }
        return this.resolveCurrentPublication(
            { id: domain.siteId, deletedAt: null },
            `hostname "${hostname}"`,
        );
    }

    /**
     * PUBLIC: a site's live posts, newest first (#232).
     *
     * Reads each post's CURRENT publication and nothing else, so an unpublished
     * or taken-down post is structurally unreachable — the same guarantee the
     * page reads give. The snapshot each row carries is what publish wrote.
     */
    async getPublicPosts(siteId: string): Promise<{ posts: unknown[] }> {
        const posts = await prisma.post.findMany({
            where: {
                siteId,
                currentPublicationId: { not: null },
                site: { deletedAt: null },
            },
            orderBy: { publishedAt: "desc" },
            select: { currentPublication: { select: { snapshot: true } } },
        });
        return {
            posts: posts
                .map((p) => p.currentPublication?.snapshot)
                .filter((s) => s !== undefined),
        };
    }

    /**
     * PUBLIC: one live post by its slug (#232). 404 when the post does not
     * exist, is not live, or belongs to another site.
     */
    async getPublicPost(siteId: string, slug: string): Promise<PublicSiteView> {
        const post = await prisma.post.findFirst({
            where: {
                siteId,
                slug,
                currentPublicationId: { not: null },
                site: { deletedAt: null },
            },
            select: {
                currentPublication: {
                    select: { snapshot: true, publishedAt: true },
                },
            },
        });
        if (!post?.currentPublication) {
            throw new NotFoundException(`No published post at "${slug}"`);
        }
        return {
            snapshot: post.currentPublication.snapshot,
            publishedAt: post.currentPublication.publishedAt,
        };
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
                id: true,
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
            siteId: site.id,
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
        await assertSiteInOrg(ctx, siteId);

        const [comments, pages] = await Promise.all([
            prisma.siteComment.findMany({
                where: { siteId, organizationId: ctx.organizationId },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    pageId: true,
                    pageTitle: true,
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
            // The live title while the page exists; the one stored with the
            // note once it does not (#277).
            pageTitle:
                (c.pageId === null ? null : titles.get(c.pageId)) ??
                c.pageTitle,
            sectionKey: c.sectionKey,
            body: c.body,
            resolvedAt: c.resolvedAt,
            createdAt: c.createdAt,
            author: {
                id: c.author.id,
                // A name is nicer, but an email always exists.
                name: c.author.name ?? c.author.email,
            },
            // A note whose page is gone is orphaned by definition.
            orphaned:
                c.pageId === null ||
                !(live.get(c.pageId)?.has(c.sectionKey) ?? false),
        }));
    }

    /**
     * Leave a note. Requires `site:comment` — the action a REVIEWER has and a
     * MEMBER does not, because leaving a note is not a read.
     */
    /**
     * A page's draft as a REVIEWER may see it: which sections are on it, in
     * order, and what each one is (#277).
     *
     * Section keys reached the client only through `getPageDraft`, which needs
     * `section:write` — a role a reviewer does not have and must not be given.
     * So a reviewer had no way to learn the key of the section they were
     * looking at, which made "pin a note to a section" impossible for exactly
     * the person the feature was built for.
     *
     * Keys, types and a short label only. Not the content: this is the outline
     * a note is attached to, and the content is already on the page they are
     * reading through the share link.
     */
    async getPageForReview(
        ctx: OrganizationContext,
        siteId: string,
        pageId: string,
    ): Promise<ReviewablePage> {
        authorize(ctx, "site:read");
        await assertSiteInOrg(ctx, siteId);
        await assertPageInSite(ctx, siteId, pageId);

        const version = await prisma.pageVersion.findFirst({
            where: {
                pageId,
                organizationId: ctx.organizationId,
                status: "DRAFT",
            },
            orderBy: { createdAt: "desc" },
            select: {
                sections: {
                    orderBy: { order: "asc" },
                    select: {
                        key: true,
                        type: true,
                        contractVersion: true,
                        content: true,
                        hidden: true,
                    },
                },
            },
        });

        return {
            sections: (version?.sections ?? []).map((section) => ({
                key: section.key,
                type: section.type,
                contractVersion: section.contractVersion,
                label: sectionLabel(section.content),
                hidden: section.hidden,
                // Sanitized on the way out, for the same reason the editor's
                // draft is (#280): this content is rendered as HTML, and a row
                // written before sanitize-on-write must not reach a reader raw.
                content: sanitizeSectionContent(
                    section.content,
                    getSectionContract(section.type, section.contractVersion)
                        ?.sanitizedFields ?? [],
                ),
            })),
        };
    }

    async createComment(
        ctx: OrganizationContext,
        siteId: string,
        dto: CreateCommentDto,
    ): Promise<{ id: string }> {
        authorize(ctx, "site:comment");
        await assertSiteInOrg(ctx, siteId);
        await assertPageInSite(ctx, siteId, dto.pageId);

        /*
         * The key must name a section that is actually on the page's draft
         * (#277). It used to accept any string, so a note pinned from a stale
         * screen — or a typo — was stored and then read as orphaned for ever:
         * the reviewer saw it saved, the owner saw a note about nothing, and
         * no error was ever raised. A 400 is the honest answer.
         */
        const page = await prisma.page.findFirst({
            where: {
                id: dto.pageId,
                siteId,
                organizationId: ctx.organizationId,
            },
            select: {
                title: true,
                versions: {
                    where: { status: "DRAFT" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { sections: { select: { key: true } } },
                },
            },
        });
        const keys = new Set(
            page?.versions.flatMap((v) => v.sections.map((x) => x.key)) ?? [],
        );
        if (!keys.has(dto.sectionKey)) {
            throw new BadRequestException(
                "That section is no longer on the page. Reload the draft and try again.",
            );
        }

        const comment = await prisma.siteComment.create({
            data: {
                siteId,
                pageId: dto.pageId,
                // Where the note was, for when the page itself is gone (#277).
                pageTitle: page?.title ?? null,
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
        await assertSiteInOrg(ctx, siteId);

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
        await assertSiteInOrg(ctx, siteId);

        return prisma.siteApproval.create({
            data: {
                siteId,
                organizationId: ctx.organizationId,
                byUserId: ctx.userId,
                outcome: dto.outcome,
                // An approval names the draft it approved (#278), so later
                // edits do not inherit it. A change request does not: it is
                // about the work as a whole and stands until it is answered.
                draftFingerprint:
                    dto.outcome === "APPROVED"
                        ? await this.currentDraftFingerprint(ctx, siteId)
                        : null,
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
        await assertSiteInOrg(ctx, siteId);

        const [latest, standing, openNotes] = await Promise.all([
            prisma.siteApproval.findFirst({
                where: { siteId, organizationId: ctx.organizationId },
                orderBy: { createdAt: "desc" },
                select: {
                    outcome: true,
                    createdAt: true,
                    by: { select: { name: true, email: true } },
                },
            }),
            // Asked as "what would happen if THIS caller published now",
            // because that is the question the editor's bar is answering.
            this.currentDraftFingerprint(ctx, siteId).then((fingerprint) =>
                this.reviewStandingFor(
                    prisma,
                    siteId,
                    ctx.organizationId,
                    fingerprint,
                    ctx.userId,
                ),
            ),
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
            outstanding: standing.outstanding,
            // "In review" is the state a REQUESTED row creates and only a
            // verdict clears (#278).
            pending:
                standing.outstanding && latest?.outcome !== "CHANGES_REQUESTED",
            approvalIsStale: standing.approvalIsStale,
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

    /**
     * Ask for a review (#278, #193).
     *
     * The act the model was missing. "Outstanding" used to mean only "the
     * latest verdict is CHANGES_REQUESTED", so a review nobody had answered
     * yet could not exist: asking someone to look and their not having looked
     * was indistinguishable from never having asked.
     *
     * Requires `site:update` — this is the person whose work it is saying they
     * are ready for eyes, not a reviewer's action. It blocks nothing:
     * publishing while it stands still succeeds, and records a bypass.
     */
    async requestReview(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<{ id: string }> {
        authorize(ctx, "site:update");
        await assertSiteInOrg(ctx, siteId);

        return prisma.siteApproval.create({
            data: {
                siteId,
                organizationId: ctx.organizationId,
                byUserId: ctx.userId,
                outcome: "REQUESTED",
                // Which draft is being put up for review, so "approved" can
                // later be checked against the same work.
                draftFingerprint: await this.currentDraftFingerprint(
                    ctx,
                    siteId,
                ),
            },
            select: { id: true },
        });
    }

    /**
     * A hash of the draft as publishing would write it, for binding an
     * approval to the work it approved (#278).
     */
    private async currentDraftFingerprint(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<string> {
        const site = await this.loadDraftSite({
            id: siteId,
            organizationId: ctx.organizationId,
            deletedAt: null,
        });
        if (!site) {
            throw new NotFoundException(`Site "${siteId}" not found`);
        }
        /*
         * The canonical snapshot, which is what an approval is really about:
         * the thing that would go live. The date passed is arbitrary because
         * the fingerprint excludes it.
         *
         * A draft mid-edit can hold a section that fails its contract, and
         * `buildSnapshot` throws on one — correct for publishing, wrong here,
         * where the question is only "is this the same draft as before". The
         * fallback hashes the draft rows instead: a different answer for the
         * same work, but a stable one, and a draft that cannot build cannot be
         * published either, so no approval can be carried across the switch.
         */
        try {
            return draftFingerprint(this.buildSnapshot(site, new Date(0)));
        } catch {
            return draftFingerprint({ unbuildableDraft: site });
        }
    }

    /**
     * Where the site stands with its reviewers, as {@link reviewStanding}
     * decides it. The query lives here; the rule lives in `review-route.ts`,
     * where publish can apply it to its own transaction's rows.
     */
    private async reviewStandingFor(
        client: Pick<typeof prisma, "siteApproval">,
        siteId: string,
        organizationId: string,
        currentFingerprint: string,
        publisherUserId: string | null,
    ) {
        const verdicts = (await client.siteApproval.findMany({
            where: {
                siteId,
                organizationId,
                // BYPASSED is publish's own record, not a verdict: it must not
                // settle the request it was written about.
                outcome: { in: ["REQUESTED", "APPROVED", "CHANGES_REQUESTED"] },
            },
            orderBy: { createdAt: "desc" },
            select: {
                outcome: true,
                byUserId: true,
                draftFingerprint: true,
                createdAt: true,
            },
        })) as ApprovalRow[];

        return reviewStanding(verdicts, currentFingerprint, publisherUserId);
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
                ...reviewerScope(ctx),
            },
            select: {
                seoDescription: true,
                currentPublicationId: true,
                currentPublication: { select: { publishedAt: true } },
                navigation: true,
                pages: {
                    select: {
                        id: true,
                        path: true,
                        title: true,
                        hidden: true,
                        updatedAt: true,
                        versions: {
                            where: { status: "DRAFT" },
                            orderBy: { createdAt: "desc" },
                            take: 1,
                            select: {
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
        /*
         * From the same diff the editor bar, settings and the sites list read
         * (#282), not from timestamps.
         *
         * Timestamps missed two whole categories. Everything that lives on the
         * Site row — search, share image, style, menu, footer — has no page to
         * date. And a section edit leaves no timestamp to compare at all:
         * saving a draft deletes and recreates the page's Section rows without
         * touching `PageVersion.updatedAt`, so that comparison sat at whenever
         * the version was created and never fired for the edit merchants make
         * most (#191).
         *
         * The diff also covers what the page's own timestamp used to catch —
         * hiding a page (#197), renaming one, moving one — because a page's
         * title, path and presence all travel in the snapshot, and `pages` is
         * one of the kinds it compares.
         *
         * Skipped before the first publish: there is nothing to diff against.
         */
        const pending =
            publishedAt === null
                ? undefined
                : (await this.pendingSectionChanges([siteId])).get(siteId);
        const hasUnpublishedChanges =
            publishedAt !== null &&
            !!pending &&
            (pending.sections > 0 || pending.site.length > 0);

        const flags = checkSite({
            navigation: parseSiteNavigation(site.navigation),
            seoDescription: site.seoDescription,
            published: site.currentPublicationId !== null,
            hasUnpublishedChanges,
            pages: site.pages.map((page) => ({
                id: page.id,
                path: page.path,
                title: page.title,
                hidden: page.hidden,
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
        await assertSiteInOrg(ctx, siteId);

        // "/" is the home page's path and the home page already exists. Caught
        // here so the merchant is told what is wrong rather than being handed
        // a unique-constraint violation.
        if (dto.path === "/") {
            throw new BadRequestException(
                "The path / already belongs to this site's home page. Choose another, for example /about.",
            );
        }
        await assertPathIsFree(siteId, dto.path);

        const page = await prisma.page.create({
            data: {
                siteId,
                organizationId: ctx.organizationId,
                path: dto.path,
                title: dto.title,
                isHome: false,
            },
            select: {
                id: true,
                path: true,
                title: true,
                isHome: true,
                hidden: true,
            },
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
        await assertSiteInOrg(ctx, siteId);

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
            await assertPathIsFree(siteId, dto.path);
        }

        if (dto.hidden === true && page.isHome) {
            throw new BadRequestException(
                "The home page is what your site's address serves, so it cannot be hidden.",
            );
        }

        return prisma.page.update({
            where: { id: pageId },
            data: {
                // ABSENT means leave alone, so each field is set only when sent.
                ...(dto.title === undefined ? {} : { title: dto.title }),
                ...(dto.path === undefined ? {} : { path: dto.path }),
                ...(dto.hidden === undefined ? {} : { hidden: dto.hidden }),
            },
            select: {
                id: true,
                path: true,
                title: true,
                isHome: true,
                hidden: true,
            },
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
        await assertSiteInOrg(ctx, siteId);

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
}

/**
 * A few words naming a section, for a list that has to distinguish two heroes
 * (#277). Whatever the block calls its most prominent line — every one of them
 * has one under a different name — trimmed to something that fits a rail.
 */
function sectionLabel(content: unknown): string | null {
    if (content === null || typeof content !== "object") return null;
    const c = content as Record<string, unknown>;
    for (const field of [
        "heading",
        "title",
        "label",
        "eyebrow",
        "subheading",
    ]) {
        const value = c[field];
        if (typeof value === "string" && value.trim().length > 0) {
            const text = value.trim();
            return text.length > 60 ? `${text.slice(0, 57)}…` : text;
        }
    }
    return null;
}
