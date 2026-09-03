import { apiFetch, getActiveOrgId, getJson, getList } from "@/lib/api/http";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

// Re-exported so callers keep one import site for "everything about a site",
// while the pure half stays in a module a client component can reach.
export { resolveStyleVariables } from "@/lib/sites/style";
export type {
    SiteStyle,
    SiteStyleOptions,
    StyleSwatch,
} from "@/lib/sites/style";

/**
 * CMS Sites data access for app.saroh.in (S2-004). Every call is org-scoped:
 * the active organization id (from the `active_org` cookie) is used both in the
 * path (`/organizations/:organizationId/...`) and forwarded as the
 * `x-organization-id` header — mirroring `lib/organizations/service.ts`. The
 * request's session cookie is forwarded so api.saroh.in derives the user and
 * enforces org membership. Server-only: imports next/headers (via the shared
 * HTTP plumbing).
 *
 * The app never imports @saroh/database — the section content types below are a
 * hand-maintained mirror of the versioned section contract
 * (packages/database/src/cms/section-contract.ts), reached only through the API.
 */

// ---------------------------------------------------------------------------
// Section content types — mirror of the section contract (v1)
// ---------------------------------------------------------------------------

/** The section types the editor supports. */
export type SectionType =
    "hero" | "richText" | "cta" | "gallery" | "enquiry" | "booking";

/** Button style shared by hero CTA and the standalone cta section. */
export type CtaStyle = "primary" | "secondary" | "link";

export interface CtaValue {
    label: string;
    href: string;
    style?: CtaStyle;
}

export interface ImageValue {
    src: string;
    alt?: string;
    width?: number;
    height?: number;
}

export interface HeroContent {
    heading: string;
    subheading?: string;
    cta?: CtaValue;
    image?: ImageValue;
}

export interface RichTextContent {
    format: "html" | "markdown";
    value: string;
}

export type CtaContent = CtaValue;

export type GalleryLayout = "grid" | "carousel" | "masonry";

export interface GalleryContent {
    images: ImageValue[];
    layout?: GalleryLayout;
}

/** The field types an enquiry form supports (mirror of the section contract). */
export type EnquiryFieldType = "text" | "email" | "tel" | "textarea";

/** One authored field in an enquiry section (snapshot of the backing Form). */
export interface EnquiryField {
    name: string;
    label: string;
    type: EnquiryFieldType;
    required?: boolean;
}

/**
 * `enquiry` v1 — a public enquiry form. `formId` points at the backing Form the
 * public submit endpoint validates against; the editor syncs it on save (it is
 * absent until then). `fields` is the authored field list mirrored onto that
 * Form.
 */
export interface EnquiryContent {
    formId?: string;
    title?: string;
    description?: string;
    submitLabel?: string;
    successMessage?: string;
    fields: EnquiryField[];
}

/**
 * `booking` v1 — a public booking widget. `serviceId` points at the bookable
 * Service the PUBLIC availability + book endpoints resolve the owning org from;
 * it is chosen from the org's services in the editor (Services are authored in
 * the service editor, not inline) and is absent until then. All values are
 * plain text.
 */
export interface BookingContent {
    serviceId?: string;
    title?: string;
    description?: string;
    submitLabel?: string;
    successMessage?: string;
}

/** Content shape keyed by section type. */
export interface SectionContentByType {
    hero: HeroContent;
    richText: RichTextContent;
    cta: CtaContent;
    gallery: GalleryContent;
    enquiry: EnquiryContent;
    booking: BookingContent;
}

/**
 * Layout every section carries, whatever its type (#189).
 *
 * Declared once and intersected below rather than repeated in all six content
 * interfaces, mirroring the single `paddingOverride` in the section contract —
 * six copies is six chances for one to drift.
 *
 * ABSENT means "follow the site setting". Not defaulted, because a default
 * would freeze today's site value into the section and stop it tracking the
 * slider afterwards.
 */
export interface SectionLayout {
    padding?: number;
}

/**
 * A section discriminated on `type`, so narrowing on `type` gives the exact
 * `content` shape. Used by the editor and preview.
 */
export type Section = {
    [K in SectionType]: {
        type: K;
        contractVersion: number;
        content: SectionContentByType[K] & SectionLayout;
        /**
         * Visibility, and deliberately a sibling of `content` rather than part
         * of it: hiding a section is not an edit to what it says. A hidden
         * section keeps its place and its copy in the draft and is left out of
         * the published snapshot. ABSENT means visible.
         */
        hidden?: boolean;
        /**
         * The section's stable identity across saves (#193). Absent only for a
         * section the editor has just added, which the server then mints one
         * for. It MUST be sent back for everything else: reviewer notes are
         * pinned to it, and a save that dropped it would detach them all.
         */
        key?: string;
    };
}[SectionType];

/** A section as returned by the draft endpoint (carries its order). */
export type DraftSection = Section & { order: number };

/** The payload the editor PUTs back (no order — array position is the order). */
export type SectionInput = Section;

// ---------------------------------------------------------------------------
// Resource types
// ---------------------------------------------------------------------------

export interface Template {
    id: string;
    version: number;
    name: string;
    description?: string;
}

export interface SiteSummary {
    id: string;
    name: string;
    slug: string;
    subdomain?: string | null;
    status?: string;
    /**
     * Null until the site has been published once. The API has always sent
     * this — `SitesService.listSites` selects it — but this interface did not
     * declare it, so the index had no way to tell a live site from a draft and
     * simply did not say. A merchant with three sites could not see which of
     * them the public could actually reach.
     */
    currentPublicationId?: string | null;
    /** When the site last went live; null if it never has. */
    currentPublication?: { publishedAt: string } | null;
    /**
     * Draft work newer than what is live. Derived server-side from
     * `pendingSectionChanges`, so it cannot say "up to date" about a site the
     * count disagrees with.
     */
    hasUnpublishedChanges?: boolean;
    /**
     * How many sections publishing would change (#190, #191). Null before the
     * first publish — there is nothing to diff against, and "never published"
     * is the more consequential thing to say.
     *
     * The editor's top bar, the settings screen and the sites list all render
     * this same number, computed once in the API.
     */
    pendingSectionChanges?: number | null;
    /** A claimed hostname that has not verified yet, if any. */
    pendingDomain?: string | null;
}

export interface SitePage {
    id: string;
    path: string;
    title: string;
    isHome: boolean;
    /** Hidden pages stay in the draft and are left out of the snapshot (#197). */
    hidden: boolean;
}

export interface SiteDetail extends SiteSummary {
    pages: SitePage[];
    /** Always present on a detail read; null only before the first publish. */
    pendingSectionChanges: number | null;
    /**
     * Search and social settings (#188). Null means "not set" and must render
     * as absent — never as an empty title or a broken image.
     */
    seoTitle: string | null;
    seoDescription: string | null;
    socialImageUrl: string | null;
    /** When the site last went live; null if it has never been published. */
    currentPublication: { publishedAt: string } | null;
    /** The site's look — always complete; absent choices come back filled. */
    style: SiteStyle;
    styleOptions: SiteStyleOptions;
}

/**
 * A settings change. Every field is optional and nullable, and the two are
 * different requests: OMIT a field to leave it alone, send NULL to clear it.
 * Sending the whole form every time would let a stale tab overwrite a value
 * someone else changed.
 */
export interface SiteSettingsInput {
    seoTitle?: string | null;
    seoDescription?: string | null;
    socialImageUrl?: string | null;
}

export interface PageDraft {
    pageVersionId: string;
    sections: DraftSection[];
    /** What publishing would change, site-wide, as of this read (#190). */
    pendingSectionChanges: number | null;
}

export interface CreateSiteInput {
    templateId?: string;
    templateVersion?: number;
    name: string;
    slug?: string;
    subdomain?: string;
}

/** Discriminated result so the UI can surface a message (and, on save, the
 * failing section index the API names in a 400). */
export type SitesResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; field?: string; index?: number };

// ---------------------------------------------------------------------------
// Fetch plumbing (shared apiFetch/getActiveOrgId from @/lib/api/http)
// ---------------------------------------------------------------------------

/** Base path for the active org's sites, or null when no org is active. */
async function sitesBase(): Promise<string | null> {
    const orgId = await getActiveOrgId();
    return orgId ? `/organizations/${orgId}/sites` : null;
}

/** Extract a human message (+ optional index) from a JSON error body. */
/**
 * Pull a human-readable message out of an API error body.
 *
 * The api's envelope is `{ error: { code, message, statusCode, correlationId } }`
 * — `error` is an OBJECT, not a string. This used to be typed as
 * `{ error?: string }` and returned straight through, so every 400 handed the
 * caller an object typed as a string. Toasts crashed the page with "Objects are
 * not valid as a React child", and the editor's inline section error would have
 * done the same. TypeScript believed the annotation; the wire disagreed.
 *
 * So the shape is now checked at runtime rather than declared, and the return
 * is a string in every branch — including the one where the body is something
 * none of this anticipated.
 */
function readError(
    data: unknown,
    fallback: string,
): { error: string; index?: number } {
    const body = (typeof data === "object" && data !== null ? data : {}) as {
        message?: unknown;
        error?: unknown;
        index?: unknown;
    };

    const nested =
        typeof body.error === "object" && body.error !== null
            ? (body.error as { message?: unknown }).message
            : undefined;

    const message = [nested, body.message, body.error].find(
        (v): v is string => typeof v === "string" && v.trim() !== "",
    );

    return {
        error: message ?? fallback,
        index: typeof body.index === "number" ? body.index : undefined,
    };
}

// ---------------------------------------------------------------------------
// Reads (called from server components)
// ---------------------------------------------------------------------------

/** Templates available to seed a new site. Empty with no active org; empty when
 * none exist, but throws on a real API/network failure (#101). */
export async function listTemplates(): Promise<Template[]> {
    const base = await sitesBase();
    if (!base) return [];
    return getList<Template>(`${base}/templates`);
}

/** The active org's sites (newest first). Empty with no active org / when none
 * exist, but throws on a real API/network failure (#101). */
export async function listSites(): Promise<SiteSummary[]> {
    const base = await sitesBase();
    if (!base) return [];
    return getList<SiteSummary>(base);
}

/** A site + its pages, or null when missing / no active org (throws on a real
 * failure). */
export async function getSite(siteId: string): Promise<SiteDetail | null> {
    const base = await sitesBase();
    if (!base) return null;
    return getJson<SiteDetail>(`${base}/${siteId}`);
}

/** The current editable draft for a page (the API creates one if none). Null on
 * a 404 / no active org; throws on a real failure. */
export async function getPageDraft(
    siteId: string,
    pageId: string,
): Promise<PageDraft | null> {
    const base = await sitesBase();
    if (!base) return null;
    return getJson<PageDraft>(`${base}/${siteId}/pages/${pageId}/draft`);
}

// ---------------------------------------------------------------------------
// Mutations (wrapped by server actions in ./actions)
// ---------------------------------------------------------------------------

/** Create a draft site from a template. Returns the new id + slug. */
export async function createSite(
    input: CreateSiteInput,
): Promise<SitesResult<{ siteId: string; slug: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(base, {
        method: "POST",
        body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as {
        siteId?: string;
        slug?: string;
        message?: string;
        error?: string;
        field?: string;
    } | null;
    if (res.ok && data?.siteId) {
        return {
            ok: true,
            data: { siteId: data.siteId, slug: data.slug ?? "" },
        };
    }
    return {
        ok: false,
        field: data?.field,
        ...readError(data, "Could not create the site"),
    };
}

/**
 * Replace a page draft's sections. The API validates each section against the
 * section contract; a 400 names the failing index + reason, surfaced here so
 * the editor can point at the bad section.
 */
export async function saveDraftSections(
    siteId: string,
    pageId: string,
    sections: SectionInput[],
): Promise<
    SitesResult<{
        pageVersionId?: string;
        pendingSectionChanges?: number | null;
    }>
> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(
        `${base}/${siteId}/pages/${pageId}/draft/sections`,
        {
            method: "PUT",
            body: JSON.stringify({ sections }),
        },
    );
    const data = (await res.json().catch(() => null)) as {
        pageVersionId?: string;
        pendingSectionChanges?: number | null;
        message?: string;
        error?: string;
        index?: number;
    } | null;
    if (res.ok) {
        return {
            ok: true,
            data: {
                pageVersionId: data?.pageVersionId,
                /*
                 * The save returns the recomputed count so the top bar stays
                 * true through a long editing session without the browser ever
                 * deciding for itself what "changed" means.
                 */
                pendingSectionChanges: data?.pendingSectionChanges ?? null,
            },
        };
    }
    return { ok: false, ...readError(data, "Could not save the sections") };
}

/** Publish an immutable snapshot of the site's current drafts. */
export async function publishSite(
    siteId: string,
): Promise<SitesResult<{ publicationId?: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/publish`, { method: "POST" });
    const data = (await res.json().catch(() => null)) as {
        publicationId?: string;
        message?: string;
        error?: string;
    } | null;
    if (res.ok) {
        return { ok: true, data: { publicationId: data?.publicationId } };
    }
    return { ok: false, ...readError(data, "Could not publish the site") };
}

/**
 * Update a site's search and social settings (#188).
 *
 * Sends only what the caller passed: an omitted field is left alone by the API
 * and an explicit null clears it, so a form that PATCHes one field cannot wipe
 * the others.
 */
export async function updateSiteSettings(
    siteId: string,
    input: SiteSettingsInput,
): Promise<SitesResult<{ id: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/settings`, {
        method: "PATCH",
        body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as {
        id?: string;
        message?: string;
        error?: string;
    } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return {
        ok: false,
        ...readError(data, "Could not save these settings."),
    };
}

/** One publish in a site's history (#194). */
export interface SitePublication {
    id: string;
    publishedAt: string;
    publishedByUserId: string | null;
    templateId: string;
    templateVersion: number;
    /** Whether this is the version the public is being served right now. */
    isCurrent: boolean;
}

/** Every publish of a site, newest first. Empty if it has never been published. */
export async function listPublications(
    siteId: string,
): Promise<SitePublication[]> {
    const base = await sitesBase();
    if (!base) return [];
    return getList<SitePublication>(`${base}/${siteId}/publications`);
}

/**
 * Put a past version back. Appends a new publication rather than deleting the
 * ones after it, so this can itself be undone.
 */
export async function restorePublication(
    siteId: string,
    publicationId: string,
): Promise<SitesResult<{ publicationId: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(
        `${base}/${siteId}/publications/${publicationId}/restore`,
        { method: "POST" },
    );
    const data = (await res.json().catch(() => null)) as {
        publicationId?: string;
        message?: string;
        error?: string;
    } | null;
    if (res.ok && data?.publicationId) {
        return { ok: true, data: { publicationId: data.publicationId } };
    }
    return { ok: false, ...readError(data, "Could not restore that version.") };
}

/** Replace a site's look. The panel always sends a whole style (#189). */
// ---------------------------------------------------------------------------
// Review — notes pinned to sections, and one approval (#193)
// ---------------------------------------------------------------------------

export interface SiteCommentView {
    id: string;
    pageId: string;
    pageTitle: string | null;
    sectionKey: string;
    body: string;
    resolvedAt: string | null;
    createdAt: string;
    author: { id: string; name: string };
    /** The section this was about is no longer on the page. */
    orphaned: boolean;
}

export interface ReviewState {
    openNotes: number;
    latestApproval: { outcome: string; at: string; by: string } | null;
}

/**
 * Every note on a site. Empty rather than throwing on failure: the Review tab
 * showing nothing is a worse outcome than the editor refusing to open, and
 * notes are not what the merchant came here to do.
 */
export async function listComments(siteId: string): Promise<SiteCommentView[]> {
    const base = await sitesBase();
    if (!base) return [];
    try {
        const res = await apiFetch(`${base}/${siteId}/comments`);
        if (!res.ok) return [];
        const data = (await res.json()) as unknown;
        return Array.isArray(data) ? (data as SiteCommentView[]) : [];
    } catch {
        return [];
    }
}

export async function getReviewState(siteId: string): Promise<ReviewState> {
    const empty: ReviewState = { openNotes: 0, latestApproval: null };
    const base = await sitesBase();
    if (!base) return empty;
    try {
        const res = await apiFetch(`${base}/${siteId}/review`);
        if (!res.ok) return empty;
        const data = (await res.json()) as Partial<ReviewState> | null;
        return {
            openNotes: typeof data?.openNotes === "number" ? data.openNotes : 0,
            latestApproval: data?.latestApproval ?? null,
        };
    } catch {
        return empty;
    }
}

/** Mark a note settled, or reopen it. Requires `section:write` on the api. */
export async function setCommentResolved(
    siteId: string,
    commentId: string,
    resolved: boolean,
): Promise<SitesResult<{ id: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/comments/${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ resolved }),
    });
    const data = (await res.json().catch(() => null)) as {
        id?: string;
    } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return { ok: false, ...readError(data, "Could not update the note.") };
}

// ---------------------------------------------------------------------------
// Flags (spec §2, "quiet until publish")
// ---------------------------------------------------------------------------

/**
 * The nine advisory checks. Mirrored from the api rather than imported, on the
 * same boundary rule as the section content types above — but the RULES are not
 * mirrored: only the api decides what is flagged, so there is one answer to
 * "what is wrong with this site" rather than two that can disagree.
 */
export type FlagType =
    | "emptyRequiredField"
    | "placeholderText"
    | "missingImage"
    | "hiddenButLinked"
    | "pageNotInNavigation"
    | "unpublishedChanges"
    | "missingSeoDescription"
    | "brokenLink"
    | "phoneWidth";

export interface Flag {
    type: FlagType;
    message: string;
    pageId: string | null;
    sectionIndex: number | null;
    field: string | null;
}

export interface SiteFlags {
    flags: Flag[];
    /** Types the api cannot check yet, so the editor can say so honestly. */
    awaitingNavigation: FlagType[];
}

/**
 * Every flag on a site. Returns an empty set rather than throwing on failure:
 * flags are advisory, and a check that cannot run is not a reason to stop
 * someone editing or publishing.
 */
export async function getSiteFlags(siteId: string): Promise<SiteFlags> {
    const empty: SiteFlags = { flags: [], awaitingNavigation: [] };
    const base = await sitesBase();
    if (!base) return empty;
    try {
        const res = await apiFetch(`${base}/${siteId}/flags`);
        if (!res.ok) return empty;
        const data = (await res.json()) as Partial<SiteFlags> | null;
        return {
            flags: Array.isArray(data?.flags) ? data.flags : [],
            awaitingNavigation: Array.isArray(data?.awaitingNavigation)
                ? data.awaitingNavigation
                : [],
        };
    } catch {
        return empty;
    }
}

/**
 * Add a page to a site. The API decides what a legal path is and whether it is
 * free — the form does not pre-check, because a client-side answer that
 * disagreed with the server's would be worse than one round trip.
 */
export async function createPage(
    siteId: string,
    input: { title: string; path: string },
): Promise<SitesResult<SitePage>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/pages`, {
        method: "POST",
        body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as
        (Partial<SitePage> & { message?: string; error?: string }) | null;
    if (res.ok && data?.id) return { ok: true, data: data as SitePage };
    return { ok: false, ...readError(data, "Could not add the page.") };
}

/** Rename a page, move it, or both. An omitted field is left alone. */
export async function updatePage(
    siteId: string,
    pageId: string,
    input: { title?: string; path?: string; hidden?: boolean },
): Promise<SitesResult<SitePage>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as
        (Partial<SitePage> & { message?: string; error?: string }) | null;
    if (res.ok && data?.id) return { ok: true, data: data as SitePage };
    return { ok: false, ...readError(data, "Could not update the page.") };
}

/** Delete a page and everything on it. The home page cannot be deleted. */
export async function deletePage(
    siteId: string,
    pageId: string,
): Promise<SitesResult<{ deleted: true }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/pages/${pageId}`, {
        method: "DELETE",
    });
    if (res.ok) return { ok: true, data: { deleted: true } };
    const data = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
    } | null;
    return { ok: false, ...readError(data, "Could not delete the page.") };
}

export async function updateSiteStyle(
    siteId: string,
    style: SiteStyle,
): Promise<SitesResult<{ id: string }>> {
    const base = await sitesBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${siteId}/style`, {
        method: "PUT",
        body: JSON.stringify(style),
    });
    const data = (await res.json().catch(() => null)) as {
        id?: string;
        message?: string;
        error?: string;
    } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return { ok: false, ...readError(data, "Could not save the style.") };
}
