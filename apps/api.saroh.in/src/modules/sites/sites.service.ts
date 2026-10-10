import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { PageKind } from "@saroh/database";
import {
    getSectionContract,
    parseSectionContent,
    Prisma,
    prisma,
    repeatedAnchor,
} from "@saroh/database";
import { isDeepStrictEqual } from "node:util";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ActivationEvents } from "../analytics/activation-events";
import { EntitlementService } from "../billing/entitlement.service";
import { planMeter } from "../billing/metering.service";
import { keptPostsOnSite } from "../content/post-paused";
import { parsePostsPrefix } from "../content/posts-prefix";
import {
    checkoutReadiness,
    readinessMessage,
} from "../orders/checkout-readiness";
import { SITE_ONLINE_ORGANIZATION } from "../organizations/organization-lifecycle.policy";
import { allows, authorize } from "../organizations/organization-policy";
import type {
    CreateApprovalDto,
    CreateCommentDto,
    CreatePageDto,
    CreateSiteFromTemplateDto,
    UpdateDraftSectionsDto,
    UpdatePageDto,
    UpdateSiteSettingsDto,
} from "./dto";
import { putLive, readReviewStanding } from "./live-pointer";
import { createModulePage, PAGE_VIEW_SELECT } from "./module-page-create";
import type { PublicModulePageStates } from "./module-pages";
import {
    addableModulePageKinds,
    packsBlockOffered,
    publicModulePageStates,
} from "./module-pages";
import type { ModulePageKind } from "./page-kinds";
import { isModulePageKind, MODULE_PAGE_DEFAULTS } from "./page-kinds";
import { pageUpdatedAt, pageUpdatedSelect } from "./page-updated";
import type { SiteChangeKind } from "./pending-changes";
import {
    countPendingSectionChanges,
    pagePathResolver,
    pendingSiteChanges,
    toPendingPages,
    toPublishableSection,
} from "./pending-changes";
import { assertGridRefsOwned, productGridFlags } from "./product-grid-checks";
import type { Renderability } from "./publication-renderability";
import { checkRenderability } from "./publication-renderability";
import {
    approvalApplies,
    assertOverrideAllowed,
    isOwner,
    setPublishNeedsApproval,
} from "./publish-approval";
import {
    frozenPages,
    isOnFrozenPage,
    releaseUnderReview,
} from "./release-under-review";
import { queueReviewAlert } from "./review-alert-queue";
import type { ReviewRoute } from "./review-route";
import { draftFingerprint } from "./review-route";
import { sanitizeRichHtml, sanitizeSectionContent } from "./sanitize";
import type { SellsFromView } from "./sells-from";
import {
    assertSellsFromChoice,
    commerceOpen,
    effectiveStorefront,
    isShopPath,
    sellsFromChoices,
    sellsFromView,
    shopRolloutOn,
} from "./sells-from";
import { awaitsSellsFrom, shopCouldServe } from "./sells-from-awaiting";
import {
    assertPageInSite,
    assertPathIsFree,
    assertSiteInOrg,
    getOrCreateDraftVersion,
    reviewerScope,
} from "./site-access";
import type { SiteDefaults } from "./site-address";
import { siteDefaults } from "./site-address";
import type { CreatedSite } from "./site-create";
import {
    newSectionKey,
    planSiteFromTemplate,
    writeSiteFromTemplate,
} from "./site-create";
import type { Flag, FlagType } from "./site-flags";
import {
    ADDRESS_MISSING_MESSAGE,
    checkAddress,
    checkShop,
    checkSite,
    FLAGS_AWAITING_NAVIGATION,
} from "./site-flags";
import type { SiteFooter } from "./site-footer";
import { footerAfterUpdate, parseSiteFooter } from "./site-footer";
import {
    isTestShapedHost,
    siteHostMode,
    siteRootDomain,
} from "./site-host-mode";
import type { PublicSiteIcon, SiteIconView } from "./site-icon";
import {
    DRAFT_ICON_SELECT,
    draftIcon,
    publicSiteIcon,
    siteIconView,
} from "./site-icon";
import type { SiteNavigation } from "./site-navigation";
import {
    parseSiteNavigation,
    resolveSiteNavigation,
    withInPageNavigation,
} from "./site-navigation";
import type { SiteStyle, SiteStyleOptions } from "./site-style";
import {
    parseSiteStyle,
    siteStyleOptions,
    siteStyleVariables,
} from "./site-style";
import {
    assertSiteLookOffered,
    recordedTemplate,
    templateColourways,
} from "./site-style-offer";
import type { SiteTemplateRecord } from "./site-template-record";
import {
    publicationTemplate,
    siteTemplate,
    templateFooterLine,
    templateFormerFooterLines,
} from "./site-template-record";

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

export type { CreatedSite };

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
    /**
     * The test release this is the review of (T8), or null for the draft's.
     * The two are kept apart: verdicts and notes on one never read on the
     * other.
     */
    testRelease: { id: string; number: number; name: string } | null;
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
    latestApproval: {
        outcome: string;
        at: Date;
        by: string;
        /** What a change request asked for (UX-043); null otherwise. */
        reason: string | null;
    } | null;
    /**
     * True while a reviewer's most recent VERDICT is CHANGES_REQUESTED and no
     * approval has followed it (#199). Publishing then still succeeds, and is
     * recorded as a bypass. A site nobody asked to review is not outstanding —
     * it is unreviewed, which is the normal state and must not nag.
     */
    outstanding: boolean;
    /**
     * The open request is the caller's own (UX-068): the workspace hides
     * Approve and Ask for changes from them — approving your own request is
     * not a second pair of eyes, and would not settle it anyway.
     */
    askedByYou: boolean;
}

/** A page as returned by the page endpoints and by getSite. */
export interface PageView {
    id: string;
    path: string;
    title: string;
    isHome: boolean;
    /** Hidden pages stay in the draft and are omitted from the snapshot. */
    hidden: boolean;
    /** FREE, or the module page this is (G14). */
    kind: PageKind;
    /** "Show in menu" (G14). */
    inMenu: boolean;
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
    /**
     * Which edit of this draft these sections are (#285). The editor sends it
     * back when it saves; a save against a stale revision is a 409 rather than
     * a silent overwrite of whoever saved in between.
     */
    revision: number;
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
    /**
     * True when an owner published past "Publishing needs approval"
     * (DEC-071, KTD-11); `route` is then OVERRIDDEN.
     */
    overridden: boolean;
    /** Which route this publish took (#278). */
    route: ReviewRoute;
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
    /**
     * Whether each module page in the snapshot shows now (G15): its module
     * on or off, read live beside the immutable snapshot. Present only when
     * the snapshot holds a module page, so a site without them reads as
     * before.
     */
    modules?: PublicModulePageStates;
    /**
     * The icon the site shows (DEC-124): its own from the snapshot, else the
     * business logo read live, else null, and the renderer draws a plain
     * tile with the site's initial. Resolved here so the renderer makes no
     * extra request.
     */
    icon?: PublicSiteIcon | null;
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
    /**
     * "Publishing needs approval" (DEC-071, R10): on, only an approved test
     * release goes live, unless an owner overrides.
     */
    publishNeedsApproval: boolean;
    /**
     * Whether this caller may go live past that setting, and turn it on or
     * off: an owner who can publish (KTD-11).
     */
    canOverride: boolean;
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
    /**
     * The site's own icon as saved, and the business logo that stands in
     * without one (DEC-124). Draft, like the share image.
     */
    icon: SiteIconView;
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
        /** FREE, or the module page this is (G14). */
        kind: PageKind;
        /** "Show in menu" (G14). */
        inMenu: boolean;
        /**
         * When the page was last changed — renamed, moved, hidden or its
         * sections saved (#908, `pageUpdatedAt`).
         */
        updatedAt: Date;
    }[];
    /**
     * The module pages this caller could add to the site now (G14): kinds
     * whose module is on and that the site doesn't have yet, in menu order.
     * Empty for a caller without `site:update`. A kind whose module isn't
     * rolled out for the business is never listed (DEC-057).
     */
    addablePageKinds: ModulePageKind[];
    /**
     * Whether Add block offers the Class packs block: Class packs rolled out
     * for the business and on. Off, the block is offered nowhere (DEC-057);
     * one already on a page stays.
     */
    packsBlockOffered: boolean;
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
    /**
     * The template the site was made from and the style chosen with it
     * (KTD-7). Null for a site made before that was recorded.
     */
    template: SiteTemplateRecord | null;
    /** Always complete — absent choices are filled from the defaults. */
    style: SiteStyle;
    /**
     * What the merchant wrote at the foot of their site (#202). Null means they
     * have written nothing, and nothing is what renders — not an empty band in
     * the footer colour.
     */
    footer: SiteFooter | null;
    /**
     * The same footer, sanitized as publish sanitizes it (#336), for the
     * editor's canvas to DRAW. `footer` is what the settings screen edits and
     * stays as written; this one is what may be rendered as markup in someone
     * else's browser. Null when there is no footer.
     */
    footerPreview: SiteFooter | null;
    /** The site's menu (#206), by page id. Null until one is built. */
    navigation: SiteNavigation | null;
    /**
     * The palette and slider bounds. Sent with the site so the editor can
     * resolve a choice locally as a slider moves, without carrying its own copy
     * of the values that could drift from the server's.
     */
    styleOptions: SiteStyleOptions;
    /**
     * The storefront this site sells from, and the ones it could (G11).
     * Null while the shop is not open for this business (the `SITE_SHOP`
     * flag, off until checkout ships): the settings show no row then.
     */
    sellsFrom: SellsFromView | null;
    /**
     * The shop could serve (`SITE_SHOP`, Commerce rolled out and on) and a
     * storefront with products could be chosen, but Sells from is
     * unanswered, so `/shop` isn't live (P4). The Shop settings say so.
     * False whenever the shop isn't open for the business (DEC-057).
     */
    shopAwaitsSellsFrom: boolean;
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
 *
 * A test release's frozen snapshot is a Publication too (`kind = 'TEST'`,
 * DEC-071). It has never been live, so it is not a version either: it is not
 * listed, opened or restored as one. Restoring one would put an unapproved
 * candidate live by a path that skips going live.
 */
const SITE_VERSION = { postId: null, kind: "LIVE" } as const;

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
    /** The test release this version went live from, if any (T12). */
    testRelease: PublicationRelease | null;
}

/** A test release, as a version it went live as names it (T12). */
export interface PublicationRelease {
    id: string;
    number: number;
    name: string;
}

/**
 * What a LIVE publication needs selected to say which test release it went
 * live from (DEC-071, T12): the release that names it as its live copy, or
 * the release whose TEST row it was copied from (KTD-2). A restore of that
 * copy is a restore, and names neither.
 */
const RELEASE_NAME = { id: true, number: true, name: true } as const;
const FROM_TEST_RELEASE = {
    wentLiveFor: { select: RELEASE_NAME },
    sourcePublication: {
        select: { kind: true, testRelease: { select: RELEASE_NAME } },
    },
} as const;

function releaseOf(p: {
    wentLiveFor: PublicationRelease | null;
    sourcePublication: {
        kind: string;
        testRelease: PublicationRelease | null;
    } | null;
}): PublicationRelease | null {
    if (p.wentLiveFor) return p.wentLiveFor;
    return p.sourcePublication?.kind === "TEST"
        ? p.sourcePublication.testRelease
        : null;
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
    // The site's own icon and its media type (DEC-124).
    ...DRAFT_ICON_SELECT,
    footer: true,
    navigation: true,
    // Not part of the snapshot: what a Publication is stamped with (KTD-7).
    templateId: true,
    templateVersion: true,
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
            // A module page travels with its kind (G14), and whether it
            // shows in the menu decides the resolved navigation.
            kind: true,
            inMenu: true,
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

/** A section as stored on a page's current draft. */
interface StoredSection {
    type: string;
    contractVersion: number;
    content: unknown;
}

/** The current draft's sections for `pageId`, by key (#275). */
async function storedDraftSectionsByKey(
    ctx: OrganizationContext,
    pageId: string,
): Promise<Map<string, StoredSection>> {
    // The same version getOrCreateDraftVersion writes to: the newest draft.
    const draft = await prisma.pageVersion.findFirst({
        where: {
            pageId,
            organizationId: ctx.organizationId,
            status: "DRAFT",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
    });
    if (!draft) return new Map();
    const rows = await prisma.section.findMany({
        where: { pageVersionId: draft.id },
        select: { key: true, type: true, contractVersion: true, content: true },
    });
    const byKey = new Map<string, StoredSection>();
    for (const row of rows) {
        if (row.key) byKey.set(row.key, row);
    }
    return byKey;
}

/**
 * A footer made safe to draw (#202, #336). Runs through the sanitizer whatever
 * the format says, rather than making the safety of what is rendered depend
 * on a string the client sent. Publish and the editor's canvas both use it,
 * so what the editor draws is what publish would write.
 */
function sanitizedFooter(footer: SiteFooter | null): SiteFooter | null {
    return footer
        ? {
              format: footer.format,
              value: sanitizeRichHtml(footer.value),
              // How it is laid out travels with it; nothing to clean.
              ...(footer.layout === "left" ? { layout: footer.layout } : {}),
          }
        : null;
}

@Injectable()
export class SitesService {
    constructor(
        private readonly entitlements: EntitlementService,
        /** The activation ledger, for the first publish (DEC-125). */
        @Optional() private readonly activation?: ActivationEvents,
    ) {}

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
        const plan = await planSiteFromTemplate(ctx, dto, this.entitlements);
        return prisma.$transaction((tx) =>
            writeSiteFromTemplate(tx, ctx, plan, { subdomain: dto.subdomain }),
        );
    }

    /**
     * What `/sites/new` prefills: the business's name and its address, or a
     * free one like it (DEC-069, L5) — the same start the Turn on sheet's
     * Website step has. Requires `site:create`: it is the creation form's.
     */
    async newSiteDefaults(ctx: OrganizationContext): Promise<SiteDefaults> {
        authorize(ctx, "site:create");
        return siteDefaults(prisma, ctx.organizationId);
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
                iconUrl: true,
                iconMediaId: true,
                postsPrefix: true,
                footer: true,
                navigation: true,
                storefrontId: true,
                publishNeedsApproval: true,
                templateId: true,
                templateVersion: true,
                templateStyleId: true,
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
                        kind: true,
                        inMenu: true,
                        // The Pages tab's Updated column (#908).
                        ...pageUpdatedSelect,
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
        const {
            style,
            footer,
            navigation,
            storefrontId,
            templateId,
            templateVersion,
            templateStyleId,
            pages,
            iconUrl,
            iconMediaId,
            ...rest
        } = site;
        const pending = await this.pendingSectionChanges([site.id]);
        const sellsFrom = (await shopRolloutOn(ctx.organizationId))
            ? await sellsFromView(prisma, {
                  organizationId: ctx.organizationId,
                  storefrontId,
              })
            : null;
        return {
            ...rest,
            pages: pages.map(({ versions, ...page }) => ({
                ...page,
                updatedAt: pageUpdatedAt({
                    updatedAt: page.updatedAt,
                    versions,
                }),
            })),
            // As it applies now (DEC-103): switched on under a plan without
            // the approval row, it reads as off, as publishing treats it.
            publishNeedsApproval: await approvalApplies(
                ctx.organizationId,
                rest.publishNeedsApproval,
            ),
            canEdit: allows(ctx, "section:write"),
            // Only an owner goes live past "Publishing needs approval", and
            // only an owner changes it (DEC-071, KTD-11).
            canOverride: isOwner(ctx) && allows(ctx, "site:publish"),
            can: {
                edit: allows(ctx, "section:write"),
                publish: allows(ctx, "site:publish"),
                comment: allows(ctx, "site:comment"),
                approve: allows(ctx, "site:approve"),
                manageSettings: allows(ctx, "site:update"),
                manageDomain: allows(ctx, "domain:manage"),
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
            icon: await siteIconView(ctx.organizationId, {
                iconUrl,
                iconMediaId,
            }),
            template: siteTemplate({
                templateId,
                templateVersion,
                templateStyleId,
            }),
            style: parseSiteStyle(style),
            // The template's colourways join the choices (DEC-090).
            styleOptions: siteStyleOptions(
                templateColourways(
                    recordedTemplate({ templateId, templateVersion }),
                ),
                templateStyleId,
            ),
            footer: parseSiteFooter(footer),
            footerPreview: sanitizedFooter(parseSiteFooter(footer)),
            navigation: parseSiteNavigation(navigation),
            sellsFrom,
            // Asked only when it could be true: Commerce's gate is a read.
            shopAwaitsSellsFrom:
                sellsFrom !== null &&
                awaitsSellsFrom(sellsFrom) &&
                (await shopCouldServe(ctx.organizationId)),
            addablePageKinds: allows(ctx, "site:update")
                ? await addableModulePageKinds(
                      ctx.organizationId,
                      site.pages.map((p) => p.kind),
                  )
                : [],
            packsBlockOffered: await packsBlockOffered(ctx.organizationId),
        };
    }

    /**
     * Update a site's name (G6) and its search and social settings (#188).
     *
     * ABSENT and NULL are deliberately different: a field the caller omitted is
     * left alone, a field sent as null is cleared. A settings form that PATCHes
     * only what changed must not wipe what it did not send, and a merchant
     * removing a share image must be able to actually remove it.
     *
     * Requires `site:update` — the same gate as renaming a site, because this is
     * what the public sees. Writing here does NOT publish: these values reach
     * the live site only through the next publish, exactly like a section edit.
     *
     * `publishNeedsApproval` is the exception to both: it is an owner's
     * alone (403 for anyone else), and it takes effect at once.
     */
    async updateSettings(
        ctx: OrganizationContext,
        siteId: string,
        dto: UpdateSiteSettingsDto,
    ) {
        authorize(ctx, "site:update");
        await assertSiteInOrg(ctx, siteId);

        const data: {
            name?: string;
            seoTitle?: string | null;
            seoDescription?: string | null;
            socialImageUrl?: string | null;
            socialImageWidth?: number | null;
            socialImageHeight?: number | null;
            socialImageBytes?: number | null;
            postsPrefix?: string | null;
            storefrontId?: string | null;
        } = {};
        // The header's name, edited in the site editor's inspector (G6). The
        // slug stays: it is the address, and renaming must not move the site.
        if (dto.name !== undefined) data.name = dto.name;
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

        // Where the site sells from (G11). Unlike the rest, not draft state:
        // the shop reads it live. Another business's storefront, or a closed
        // one, is refused.
        if (dto.storefrontId !== undefined) {
            if (dto.storefrontId !== null) {
                await assertSellsFromChoice(
                    prisma,
                    ctx.organizationId,
                    dto.storefrontId,
                );
            }
            data.storefrontId = dto.storefrontId;
        }

        /*
         * "Publishing needs approval" (DEC-071, R10): owner only, recorded
         * as an audit event, and in its own transaction with that record.
         * Saved first, so an admin's 403 leaves the rest of the form unsaved
         * rather than half of it written.
         */
        const needsApproval = dto.publishNeedsApproval;
        if (needsApproval !== undefined) {
            await prisma.$transaction((tx) =>
                setPublishNeedsApproval(tx, ctx, siteId, needsApproval),
            );
        }

        const site = await prisma.site.update({
            where: { id: siteId },
            data,
            select: {
                id: true,
                name: true,
                storefrontId: true,
                publishNeedsApproval: true,
                seoTitle: true,
                seoDescription: true,
                socialImageUrl: true,
                socialImageWidth: true,
                socialImageHeight: true,
                socialImageBytes: true,
                postsPrefix: true,
            },
        });
        return {
            ...site,
            publishNeedsApproval: await approvalApplies(
                ctx.organizationId,
                site.publishNeedsApproval,
            ),
        };
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
        // A palette or type scale only as one of the template's colourways
        // (DEC-090): never colours a merchant typed.
        await assertSiteLookOffered(ctx.organizationId, siteId, style);
        // Changing the theme and fonts is a plan row (U13); a site keeps the
        // look it has where the plan leaves it off.
        await planMeter.assertIncluded(ctx.organizationId, "themes");

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
        // An update that sends only the line keeps the stored layout (a
        // template's left-hand row), so it is read first.
        parseSiteFooter(input);
        const stored = await prisma.site.findFirst({
            where: { id: siteId, organizationId: ctx.organizationId },
            select: { footer: true },
        });
        const parsed = footerAfterUpdate(input, stored?.footer ?? null);
        // Sanitized on the way IN as well as at publish (#280). Publish is not
        // the only reader of what is stored here, and "safe because publish
        // cleans it" left every other reader trusting HTML nobody had cleaned.
        const footer: SiteFooter | null = sanitizedFooter(parsed);

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
                // request (#199), or an owner went live past "Publishing
                // needs approval" (DEC-071, T9): each record names its
                // publication.
                approvals: {
                    where: { outcome: { in: ["BYPASSED", "OVERRIDDEN"] } },
                    orderBy: { createdAt: "asc" },
                    select: {
                        outcome: true,
                        createdAt: true,
                        by: { select: { name: true, email: true } },
                    },
                },
                // The test release this version went live from (T12).
                ...FROM_TEST_RELEASE,
            },
        });

        // Names, not ids (#283). "Who put this live" is a question the list
        // exists to answer, and a Publication records only the user id.
        const publishers = await this.userNames(
            publications.map((p) => p.publishedByUserId),
        );

        const record = (
            approvals: (typeof publications)[number]["approvals"],
            outcome: "BYPASSED" | "OVERRIDDEN",
        ) => {
            const row = approvals.find((a) => a.outcome === outcome);
            return row
                ? { at: row.createdAt, by: row.by.name ?? row.by.email }
                : null;
        };

        return publications.map(
            ({ approvals, wentLiveFor, sourcePublication, ...p }) => ({
                ...p,
                publishedBy: p.publishedByUserId
                    ? (publishers.get(p.publishedByUserId) ?? null)
                    : null,
                bypass: record(approvals, "BYPASSED"),
                // Who went live past the setting, beside a bypass rather than
                // in place of one (T12).
                override: record(approvals, "OVERRIDDEN"),
                testRelease: releaseOf({ wentLiveFor, sourcePublication }),
                // Which one the public is actually being served. Marked rather than
                // implied by position: after a restore the live version is NOT the
                // newest by content, only by publish time.
                isCurrent: p.id === site.currentPublicationId,
            }),
        );
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
                ...FROM_TEST_RELEASE,
            },
        });
        if (!publication) {
            throw new NotFoundException(
                `Publication "${publicationId}" not found`,
            );
        }
        const { wentLiveFor, sourcePublication, ...row } = publication;
        const publishers = await this.userNames([
            publication.publishedByUserId,
        ]);
        return {
            ...row,
            publishedBy: row.publishedByUserId
                ? (publishers.get(row.publishedByUserId) ?? null)
                : null,
            renderability: checkRenderability(row.snapshot),
            testRelease: releaseOf({ wentLiveFor, sourcePublication }),
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
        /**
         * An owner restoring past "Publishing needs approval" (DEC-071, Q3):
         * with the setting on, a restore is refused (409) unless an owner
         * overrides, and the override is recorded. 403 from anyone else.
         */
        options: { override?: boolean } = {},
    ) {
        authorize(ctx, "site:publish");
        assertOverrideAllowed(ctx, options.override);
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

        return prisma.$transaction((tx) =>
            // A restore is a publish, and goes through the one path that
            // repoints the live site (KTD-3): it says which route it took
            // (#278) and records a bypass (#279) like any other.
            putLive(tx, {
                site: { id: siteId, organizationId: ctx.organizationId },
                snapshot: source.snapshot,
                source: "restore",
                actor: { userId: ctx.userId, owner: isOwner(ctx) },
                override: options.override,
                fingerprint,
                template: {
                    id: source.templateId,
                    version: source.templateVersion,
                },
                pageId: source.pageId,
                path: source.path,
            }).then(
                ({
                    publicationId,
                    publishedAt,
                    bypassed,
                    overridden,
                    route,
                }) => ({
                    publicationId,
                    publishedAt,
                    bypassed,
                    overridden,
                    route,
                }),
            ),
        );
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
            // What the editor has to send back when it saves (#285).
            revision: version.revision,
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
        const parsed = dto.sections.map((section) =>
            parseSectionContent(
                section.type,
                section.contractVersion,
                section.content,
            ),
        );
        /*
         * A section this request does not CHANGE is not re-validated (#275,
         * review of #328). One stored before its contract tightened fails
         * validation for ever, and since every save sends the whole list, it
         * used to make every save of its page fail too: nothing on that page
         * could be saved until someone found and rewrote it. A section equal
         * to the stored one under the same key (type, version and content;
         * key order ignored, since jsonb reorders keys) is carried through as
         * stored. Anything new or changed is validated as before, so nothing
         * invalid can be ADDED this way. Read only when something fails, so
         * an ordinary save costs nothing extra.
         */
        const stored = parsed.some((r) => !r.success)
            ? await storedDraftSectionsByKey(ctx, pageId)
            : new Map<string, StoredSection>();
        const seenKeys = new Set<string>();
        const validated = dto.sections.map((section, index) => {
            const result = parsed[index];
            if (!result.success) {
                const unchanged = section.key
                    ? stored.get(section.key)
                    : undefined;
                if (
                    unchanged?.type === section.type &&
                    unchanged.contractVersion === section.contractVersion &&
                    isDeepStrictEqual(unchanged.content, section.content)
                ) {
                    return {
                        type: section.type,
                        contractVersion: section.contractVersion,
                        order: index,
                        // Already sanitized when it was first stored.
                        content: unchanged.content,
                        // Hiding is not content: a stored-invalid section can
                        // still be hidden or shown.
                        hidden: section.hidden ?? false,
                        key: claimKey(seenKeys, section.key),
                    };
                }
                // `details` is what the exception filter forwards: the
                // editor points at the section by its index.
                throw new BadRequestException({
                    message: `Section at index ${index} is invalid: ${result.error.message}`,
                    details: {
                        index,
                        section: {
                            type: section.type,
                            contractVersion: section.contractVersion,
                        },
                    },
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

        // A section's anchor is an element id on its page, so a page holds
        // each one once (`section-frame.ts`). Refused with the second use's
        // index, so the editor points at the block that repeats it.
        const repeated = repeatedAnchor(validated);
        if (repeated) {
            throw new BadRequestException({
                message: `Section at index ${repeated.index} is invalid: another section on this page already uses the link name "${repeated.anchor}"`,
                details: { index: repeated.index, field: "anchor" },
            });
        }

        // A Product grid names only this business's collection and products
        // (G12). An id its stored self already named passes, so a deleted
        // product never blocks the page's later saves; the flag says so.
        await assertGridRefsOwned(ctx.organizationId, validated, () =>
            storedDraftSectionsByKey(ctx, pageId),
        );

        const draft = await prisma.$transaction(async (tx) => {
            const version = await getOrCreateDraftVersion(tx, ctx, pageId);

            /*
             * Optimistic concurrency (#285).
             *
             * This method DELETES every section on the page and recreates the
             * list the client sent, so two tabs — or two people — on one page
             * each save their whole list and the last write wins. The loser's
             * work vanishes with no conflict, no error and no trace, and any
             * note pinned to a section only they had is orphaned with it.
             *
             * A client that sends the revision it was given gets a 409 when the
             * draft has moved on. One that sends none is trusted, because a
             * caller that never read the draft cannot be clobbering an edit it
             * saw — and requiring it would break every existing client the day
             * this shipped.
             */
            if (
                dto.revision !== undefined &&
                dto.revision !== version.revision
            ) {
                throw new ConflictException({
                    message:
                        "Someone else saved this page while you were editing. Reload to see their version.",
                    code: "DRAFT_REVISION_MISMATCH",
                    yours: dto.revision,
                    current: version.revision,
                });
            }

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
            // Bumped in the same transaction as the write it describes, so a
            // reader can never see the new sections at the old revision.
            const bumped = await tx.pageVersion.update({
                where: { id: version.id },
                data: { revision: { increment: 1 } },
                select: { revision: true },
            });

            return {
                pageId,
                pageVersionId: version.id,
                status: "DRAFT" as const,
                revision: bumped.revision,
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
                // A module page says what it is (G14), so the site can draw
                // it at its route. A free-form page carries nothing new, so
                // every snapshot of a site without module pages is byte for
                // byte what it was.
                ...(isModulePageKind(page.kind) ? { kind: page.kind } : {}),
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
        const publishedFooter = sanitizedFooter(draftFooter);
        const icon = draftIcon(site);
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
                // The site's own icon (DEC-124), only when it has one: a
                // site without keeps a snapshot byte for byte what it was,
                // so an approval given before icons still covers its draft.
                // The logo that stands in is the business's and is read
                // live, never copied here.
                ...(icon ? { icon } : {}),
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
                navigation: withInPageNavigation(
                    resolveSiteNavigation(
                        parseSiteNavigation(site.navigation),
                        site.pages,
                    ),
                    // The home page's own sections, as this publish writes
                    // them: each one with a menu label leads the menu.
                    pages.find((p) => p.isHome)?.sections ?? [],
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
        /**
         * An owner publishing past "Publishing needs approval" (DEC-071,
         * R10): with the setting on, a direct publish is refused (409)
         * unless an owner overrides, and the override is recorded. 403
         * from anyone else.
         */
        options: { override?: boolean } = {},
    ): Promise<PublishResult> {
        authorize(ctx, "site:publish");
        assertOverrideAllowed(ctx, options.override);

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

        const published = await prisma.$transaction(async (tx) => {
            /*
             * No web address, no publish (DEC-069, L5): the one pre-publish
             * flag that blocks (`checkAddress`). Asked here, beside the
             * write, so an address removed mid-publish is not missed.
             */
            const addressed = await tx.site.findUniqueOrThrow({
                where: { id: site.id },
                select: { subdomain: true },
            });
            if (!addressed.subdomain) {
                throw new ConflictException({
                    message: ADDRESS_MISSING_MESSAGE,
                    details: { field: "subdomain", reason: "addressMissing" },
                });
            }

            /*
             * Through the one path that repoints the live site (KTD-3). It
             * asks the review standing INSIDE this transaction (#278): a
             * verdict posted while a publish is in flight is not missed.
             *
             * The Publication's required template stamp is the site's own
             * template (KTD-7); a site made before that was recorded
             * stamps the starter, as every publish did until then.
             */
            const live = await putLive(tx, {
                site: { id: site.id, organizationId: ctx.organizationId },
                snapshot,
                source: "publish",
                actor: { userId: ctx.userId, owner: isOwner(ctx) },
                override: options.override,
                fingerprint,
                template: publicationTemplate(site),
                publishedAt,
            });
            return {
                publicationId: live.publicationId,
                publishedAt: live.publishedAt,
                currentPublicationId: live.publicationId,
                bypassed: live.bypassed,
                overridden: live.overridden,
                route: live.route,
            };
        });
        // The first time one of the business's websites went live
        // (DEC-125). After the commit; stored once by the ledger, and it
        // swallows its own errors.
        await this.activation?.firstSitePublished(ctx.organizationId, site.id);
        return published;
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
        // A test host's label is never a live address (DEC-071, KTD-7), even
        // if a site somehow held one: refused before anything is read.
        const root = siteRootDomain();
        if (isTestShapedHost(`${subdomain}.${root}`, root)) {
            throw new NotFoundException(
                `No published site found for subdomain "${subdomain}"`,
            );
        }
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
        // A test host is never served the live site (DEC-071, KTD-7).
        if ((await siteHostMode(hostname)).mode === "test") {
            throw new NotFoundException(
                `No published site found for hostname "${hostname}"`,
            );
        }
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
        // A post a move to a lower plan paused is hidden (#800).
        const kept = await keptPostsOnSite(siteId);
        const posts = await prisma.post.findMany({
            where: {
                siteId,
                currentPublicationId: { not: null },
                // Offline with its business (#921).
                site: {
                    deletedAt: null,
                    organization: SITE_ONLINE_ORGANIZATION,
                },
                AND: [kept],
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
        const kept = await keptPostsOnSite(siteId);
        const post = await prisma.post.findFirst({
            where: {
                siteId,
                slug,
                currentPublicationId: { not: null },
                // Offline with its business (#921).
                site: {
                    deletedAt: null,
                    organization: SITE_ONLINE_ORGANIZATION,
                },
                AND: [kept],
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
            // A second lock (DEC-071, KTD-2): the live pointer only ever names
            // a LIVE row, and a real host is never served anything else.
            // A deleted business's site is offline (#921): it reads as never
            // published, from every address.
            where: {
                AND: [
                    where,
                    { currentPublication: { kind: "LIVE" } },
                    { organization: SITE_ONLINE_ORGANIZATION },
                ],
            },
            select: {
                id: true,
                organizationId: true,
                currentPublication: {
                    select: { snapshot: true, publishedAt: true },
                },
            },
        });
        if (!site?.currentPublication) {
            throw new NotFoundException(`No published site found for ${label}`);
        }
        const { snapshot, publishedAt } = site.currentPublication;
        // Module pages show only while their module is on (G15); the
        // organization comes from the Site, never from the caller.
        const modules = await publicModulePageStates(
            snapshot,
            site.organizationId,
        );
        return {
            snapshot,
            publishedAt,
            siteId: site.id,
            ...(modules ? { modules } : {}),
            icon: await publicSiteIcon(snapshot, site.organizationId),
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
        /**
         * A test release's notes instead of the draft's (T8), each resolved
         * against the release's frozen pages rather than the draft.
         */
        testReleaseId?: string,
    ): Promise<CommentView[]> {
        authorize(ctx, "site:read");
        await assertSiteInOrg(ctx, siteId);
        const release = testReleaseId
            ? await releaseUnderReview(ctx, siteId, testReleaseId, {
                  open: false,
              })
            : null;
        const frozen = release
            ? await frozenPages(ctx.organizationId, release.id)
            : null;

        const [comments, pages] = await Promise.all([
            prisma.siteComment.findMany({
                where: {
                    siteId,
                    organizationId: ctx.organizationId,
                    // The draft's notes and a release's are kept apart: a
                    // note on a release is about bytes the draft may no
                    // longer hold.
                    testReleaseId: release?.id ?? null,
                },
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
                    path: true,
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
        const paths = new Map(pages.map((p) => [p.id, p.path]));
        const attached = (pageId: string, sectionKey: string): boolean =>
            frozen
                ? // A release's page never changes; its path is how the
                  // frozen snapshot names it.
                  isOnFrozenPage(frozen, paths.get(pageId), sectionKey)
                : (live.get(pageId)?.has(sectionKey) ?? false);

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
            orphaned: c.pageId === null || !attached(c.pageId, c.sectionKey),
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
        // A note on a release is about what it froze (T8), and a release
        // that is gone or live takes no more notes.
        const release = dto.testReleaseId
            ? await releaseUnderReview(ctx, siteId, dto.testReleaseId, {
                  open: true,
              })
            : null;
        await assertPageInSite(ctx, siteId, dto.pageId);

        /*
         * The key must name a section that is actually on the page's draft
         * (#277). It used to accept any string, so a note pinned from a stale
         * screen — or a typo — was stored and then read as orphaned for ever:
         * the reviewer saw it saved, the owner saw a note about nothing, and
         * no error was ever raised. A 400 is the honest answer.
         *
         * On a release, the same check is made of the release's frozen page
         * instead, whatever the draft holds now.
         */
        const page = await prisma.page.findFirst({
            where: {
                id: dto.pageId,
                siteId,
                organizationId: ctx.organizationId,
            },
            select: {
                title: true,
                path: true,
                versions: {
                    where: { status: "DRAFT" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { sections: { select: { key: true } } },
                },
            },
        });
        if (release) {
            const frozen = await frozenPages(ctx.organizationId, release.id);
            if (!isOnFrozenPage(frozen, page?.path, dto.sectionKey)) {
                throw new BadRequestException(
                    "That section isn't on this page of the test release. Reload it and try again.",
                );
            }
        } else {
            const keys = new Set(
                page?.versions.flatMap((v) => v.sections.map((x) => x.key)) ??
                    [],
            );
            if (!keys.has(dto.sectionKey)) {
                throw new BadRequestException(
                    "That section is no longer on the page. Reload the draft and try again.",
                );
            }
        }

        return prisma.$transaction(async (tx) => {
            const comment = await tx.siteComment.create({
                data: {
                    siteId,
                    pageId: dto.pageId,
                    // Where the note was, for when the page itself is gone (#277).
                    pageTitle: page?.title ?? null,
                    organizationId: ctx.organizationId,
                    sectionKey: dto.sectionKey,
                    authorUserId: ctx.userId,
                    body: dto.body,
                    ...(release ? { testReleaseId: release.id } : {}),
                },
                select: { id: true },
            });
            // A reviewer's note tells the people who publish (UX-043); one
            // by them is the team talking to itself.
            if (!allows(ctx, "site:publish")) {
                await queueReviewAlert(tx, ctx.organizationId, {
                    event: "review",
                    about: "note",
                    commentId: comment.id,
                });
            }
            return comment;
        });
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

        if (dto.testReleaseId) {
            // A verdict on a release is about its frozen bytes, whatever
            // the draft does next (KTD-10). Both outcomes carry them: a
            // change request on release 2 is not about release 3.
            const release = await releaseUnderReview(
                ctx,
                siteId,
                dto.testReleaseId,
                { open: true },
            );
            return this.approvalWithAlert(ctx, {
                siteId,
                organizationId: ctx.organizationId,
                byUserId: ctx.userId,
                outcome: dto.outcome,
                reason: reasonOf(dto),
                draftFingerprint: release.fingerprint,
                testReleaseId: release.id,
            });
        }

        return this.approvalWithAlert(ctx, {
            siteId,
            organizationId: ctx.organizationId,
            byUserId: ctx.userId,
            outcome: dto.outcome,
            reason: reasonOf(dto),
            // An approval names the draft it approved (#278), so later
            // edits do not inherit it. A change request does not: it is
            // about the work as a whole and stands until it is answered.
            draftFingerprint:
                dto.outcome === "APPROVED"
                    ? await this.currentDraftFingerprint(ctx, siteId)
                    : null,
        });
    }

    /**
     * Write a review row and, on its transaction, tell the other side
     * (UX-043): a request goes to the site's reviewers, a verdict to the
     * people who publish (`notifications/review-alerts.ts`).
     */
    private approvalWithAlert(
        ctx: OrganizationContext,
        data: Prisma.SiteApprovalUncheckedCreateInput,
    ): Promise<{ id: string }> {
        return prisma.$transaction(async (tx) => {
            const approval = await tx.siteApproval.create({
                data,
                select: { id: true },
            });
            await queueReviewAlert(
                tx,
                ctx.organizationId,
                { event: "review", about: "approval", approvalId: approval.id },
                data.outcome === "REQUESTED" ? data.siteId : undefined,
            );
            return approval;
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
        /**
         * A test release's review instead of the draft's (T8): its verdicts,
         * bound to its fingerprint, and its own notes. The two never mix, so
         * approving a release leaves the draft's review as it was.
         */
        testReleaseId?: string,
    ): Promise<ReviewState> {
        authorize(ctx, "site:read");
        await assertSiteInOrg(ctx, siteId);
        const release = testReleaseId
            ? await releaseUnderReview(ctx, siteId, testReleaseId, {
                  open: false,
              })
            : null;

        // A release's verdicts (by fingerprint, as the standing reads them)
        // and its go-live's own record; or the draft's.
        const scope = release
            ? {
                  OR: [
                      {
                          testReleaseId: { not: null },
                          draftFingerprint: release.fingerprint,
                      },
                      { testReleaseId: release.id },
                  ],
              }
            : { testReleaseId: null };
        const [latest, standing, openNotes, newestAsk] = await Promise.all([
            prisma.siteApproval.findFirst({
                where: {
                    siteId,
                    organizationId: ctx.organizationId,
                    ...scope,
                },
                // Two reviews can share a millisecond; the id (a cuid, which grows)
                // keeps "newest" deterministic.
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                select: {
                    outcome: true,
                    reason: true,
                    createdAt: true,
                    by: { select: { name: true, email: true } },
                },
            }),
            // Asked as "what would happen if THIS caller published now",
            // because that is the question the editor's bar is answering.
            // A release asks it of its own bytes.
            release
                ? readReviewStanding(prisma, {
                      siteId,
                      organizationId: ctx.organizationId,
                      fingerprint: release.fingerprint,
                      publisherUserId: ctx.userId,
                      scope: "release",
                  })
                : this.currentDraftFingerprint(ctx, siteId).then(
                      (fingerprint) =>
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
                    testReleaseId: release?.id ?? null,
                },
            }),
            prisma.siteApproval.findFirst({
                where: {
                    siteId,
                    organizationId: ctx.organizationId,
                    outcome: "REQUESTED",
                    ...scope,
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                select: { byUserId: true },
            }),
        ]);
        const pending =
            standing.outstanding && latest?.outcome !== "CHANGES_REQUESTED";

        return {
            testRelease: release
                ? { id: release.id, number: release.number, name: release.name }
                : null,
            openNotes,
            outstanding: standing.outstanding,
            // "In review" is the state a REQUESTED row creates and a
            // verdict, a withdrawal or going live clears (#278, UX-068).
            pending,
            askedByYou: pending && newestAsk?.byUserId === ctx.userId,
            approvalIsStale: standing.approvalIsStale,
            latestApproval:
                latest === null
                    ? null
                    : {
                          outcome: latest.outcome,
                          at: latest.createdAt,
                          by: latest.by.name ?? latest.by.email,
                          reason: latest.reason ?? null,
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
        /** Put a test release up for review instead of the draft (T8). */
        testReleaseId?: string,
    ): Promise<{ id: string }> {
        authorize(ctx, "site:update");
        await assertSiteInOrg(ctx, siteId);

        if (testReleaseId) {
            // Bound to the release's bytes, so an approval of them is what
            // settles it (KTD-10).
            const release = await releaseUnderReview(
                ctx,
                siteId,
                testReleaseId,
                { open: true },
            );
            return this.approvalWithAlert(ctx, {
                siteId,
                organizationId: ctx.organizationId,
                byUserId: ctx.userId,
                outcome: "REQUESTED",
                draftFingerprint: release.fingerprint,
                testReleaseId: release.id,
            });
        }

        return this.approvalWithAlert(ctx, {
            siteId,
            organizationId: ctx.organizationId,
            byUserId: ctx.userId,
            outcome: "REQUESTED",
            // Which draft is being put up for review, so "approved" can
            // later be checked against the same work.
            draftFingerprint: await this.currentDraftFingerprint(ctx, siteId),
        });
    }

    /**
     * Take back the draft's open review request (UX-068): `site:update`,
     * like asking. Refused with 409 when nothing is open. Writes WITHDRAWN,
     * which closes the request (`CLOSING_OUTCOMES`); asking again opens a
     * new one.
     */
    async withdrawReview(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<{ id: string }> {
        authorize(ctx, "site:update");
        await assertSiteInOrg(ctx, siteId);
        const standing = await this.reviewStandingFor(
            prisma,
            siteId,
            ctx.organizationId,
            await this.currentDraftFingerprint(ctx, siteId),
            ctx.userId,
        );
        if (!standing.outstanding) {
            throw new ConflictException({
                code: "NO_OPEN_REVIEW",
                message: "There's no open review request to withdraw.",
            });
        }
        return prisma.siteApproval.create({
            data: {
                siteId,
                organizationId: ctx.organizationId,
                byUserId: ctx.userId,
                outcome: "WITHDRAWN",
            },
            select: { id: true },
        });
    }

    /**
     * A hash of the draft as publishing would write it, for binding an
     * approval to the work it approved (#278). Test releases compare theirs
     * against it to say "Your draft has changed since" (DEC-071).
     */
    async currentDraftFingerprint(
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
     * Where the draft stands with its reviewers, as `reviewStanding`
     * decides it. The query is `readReviewStanding` in `live-pointer.ts`, the
     * same one `putLive` asks of its own transaction; the rule lives in
     * `review-route.ts`. A test release's verdicts are not the draft's (T8).
     */
    private async reviewStandingFor(
        client: Pick<typeof prisma, "siteApproval">,
        siteId: string,
        organizationId: string,
        currentFingerprint: string,
        publisherUserId: string | null,
    ) {
        return readReviewStanding(client, {
            siteId,
            organizationId,
            fingerprint: currentFingerprint,
            publisherUserId,
            scope: "draft",
        });
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
                storefrontId: true,
                subdomain: true,
                footer: true,
                templateId: true,
                templateVersion: true,
                pages: {
                    select: {
                        id: true,
                        path: true,
                        title: true,
                        hidden: true,
                        kind: true,
                        inMenu: true,
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
            // The footer still in its template's words (round 2).
            footer: parseSiteFooter(site.footer),
            templateFooterLine: templateFooterLine(site),
            formerTemplateFooterLines: templateFormerFooterLines(site),
            pages: site.pages.map((page) => ({
                id: page.id,
                path: page.path,
                title: page.title,
                hidden: page.hidden,
                kind: page.kind,
                inMenu: page.inMenu,
                // `versions` is the latest draft or empty; a page with no draft
                // has no sections to check rather than being an error.
                sections: page.versions.flatMap((v) => v.sections),
            })),
        });

        // The shop's questions (G11), only while it is open for the business
        // and Commerce is on: before that there is no shop to ask about.
        if (
            (await shopRolloutOn(ctx.organizationId)) &&
            (await commerceOpen(prisma, ctx.organizationId))
        ) {
            const sellsFrom = {
                organizationId: ctx.organizationId,
                storefrontId: site.storefrontId,
            };
            const [chosen, choices] = await Promise.all([
                effectiveStorefront(prisma, sellsFrom),
                sellsFromChoices(prisma, ctx.organizationId),
            ]);
            // Whether that storefront can take an online order (G13): the
            // same question the site's checkout asks.
            const ready = chosen
                ? await checkoutReadiness(prisma, ctx.organizationId, chosen.id)
                : null;
            // The Product grids (G12): what each names that isn't on sale
            // at the storefront. Asked only once one is chosen; until then
            // the question above covers every grid.
            if (chosen) {
                flags.push(
                    ...(await productGridFlags(
                        ctx.organizationId,
                        chosen,
                        site.pages.map((page) => ({
                            id: page.id,
                            hidden: page.hidden,
                            sections: page.versions.flatMap((v) => v.sections),
                        })),
                    )),
                );
            }
            flags.unshift(
                ...checkShop({
                    storefrontChosen: chosen !== null,
                    candidates: choices.length,
                    pages: site.pages,
                    isShopPath,
                    cantTakeOrders:
                        ready && !ready.ok
                            ? {
                                  reason: ready.reason,
                                  message: readinessMessage(ready.reason),
                              }
                            : null,
                }),
            );
        }

        // No web address (L5): the one flag that blocks, so it comes first.
        flags.unshift(...checkAddress(site.subdomain));

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

        // A module page (G14) starts with its kind's sections.
        if (isModulePageKind(dto.kind)) {
            const site = await prisma.site.findFirst({
                where: { id: siteId, organizationId: ctx.organizationId },
                select: { id: true, name: true },
            });
            if (!site)
                throw new NotFoundException(`Site "${siteId}" not found`);
            return createModulePage(ctx, site, dto.kind, dto);
        }

        // The DTO requires both for a free-form page; checked again so the
        // service never trusts that it ran.
        if (dto.path === undefined || dto.title === undefined) {
            throw new BadRequestException(
                "A page needs a title and an address.",
            );
        }
        await assertPathIsFree(siteId, dto.path, { title: dto.title });

        return prisma.page.create({
            data: {
                siteId,
                organizationId: ctx.organizationId,
                path: dto.path,
                title: dto.title,
                isHome: false,
                ...(dto.inMenu === undefined ? {} : { inMenu: dto.inMenu }),
            },
            select: PAGE_VIEW_SELECT,
        });
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
            select: {
                id: true,
                path: true,
                isHome: true,
                title: true,
                kind: true,
            },
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
            // A Book or Shop page is its route's (G14): its title and menu
            // name change, its address never does.
            if (
                isModulePageKind(page.kind) &&
                MODULE_PAGE_DEFAULTS[page.kind].fixedPath
            ) {
                throw new BadRequestException({
                    message: `This page is always at ${page.path}. You can change its title.`,
                    details: { field: "path", reason: "fixed" },
                });
            }
            if (dto.path === "/") {
                throw new BadRequestException(
                    "The path / already belongs to this site's home page.",
                );
            }
            await assertPathIsFree(siteId, dto.path, {
                kind: page.kind,
                title: dto.title ?? page.title,
            });
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
                ...(dto.inMenu === undefined ? {} : { inMenu: dto.inMenu }),
            },
            select: PAGE_VIEW_SELECT,
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

/** A change request's reason (UX-043); nothing on an approval. */
function reasonOf(dto: CreateApprovalDto): string | null {
    return dto.outcome === "CHANGES_REQUESTED" ? (dto.reason ?? null) : null;
}
