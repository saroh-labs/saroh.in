"use server";

import { writeAsOrgIfSent } from "@/lib/api/assert-active-org";

import type { VisitPlacesRead } from "@/lib/stores/storefronts";
import { listVisitPlaces } from "@/lib/stores/storefronts";
import { listPlans } from "@/lib/subscriptions/service";
import type { LookId } from "@saroh/block-contract";

import type { GridCatalogueRead } from "./grid-catalogue";
import { readGridCatalogue } from "./grid-catalogue";
import { withPhotoDescription } from "./photo-description";
import { savePublishNeedsApproval } from "./publish-approval-read";
import type { SearchTrackingSave } from "./search-tracking";
import { saveSearchTracking as saveSearchTrackingApi } from "./search-tracking-read";
import type {
    CreatePageInput,
    CreateSiteInput,
    PreviewLinkDays,
    ReviewerVerdict,
    SectionInput,
    SiteFooter,
    SiteNavigation,
    SiteSettingsInput,
    SiteStyle,
    UpdatePageInput,
} from "./service";
import {
    bringInSection as bringInSectionApi,
    copyStarterContent as copyStarterContentApi,
    createApproval as createApprovalApi,
    createComment as createCommentApi,
    createPage as createPageApi,
    createPreviewLink as createPreviewLinkApi,
    createSite as createSiteApi,
    createSiteRedirect as createSiteRedirectApi,
    deleteComment as deleteCommentApi,
    deletePage as deletePageApi,
    duplicatePage as duplicatePageApi,
    fillDetails as fillDetailsApi,
    getPageDraft,
    getReviewState as getReviewStateApi,
    getSiteFlags as getSiteFlagsApi,
    listComments as listCommentsApi,
    listDraftVersions as listDraftVersionsApi,
    listPreviewLinks as listPreviewLinksApi,
    publishSite as publishSiteApi,
    recordChangeVerdict as recordChangeVerdictApi,
    recordPageView as recordPageViewApi,
    removeSiteRedirect as removeSiteRedirectApi,
    requestReview as requestReviewApi,
    restorePublication as restorePublicationApi,
    revokePreviewLink as revokePreviewLinkApi,
    rollbackDraft as rollbackDraftApi,
    saveDraftSections as saveDraftSectionsApi,
    saveSiteIcon as saveSiteIconApi,
    setCommentResolved as setCommentResolvedApi,
    undoStarterContent as undoStarterContentApi,
    updateCommentBody as updateCommentBodyApi,
    updatePage as updatePageApi,
    updateSiteFooter as updateSiteFooterApi,
    updateSiteNavigation as updateSiteNavigationApi,
    updateSiteSettings as updateSiteSettingsApi,
    updateSiteStyle as updateSiteStyleApi,
    withdrawReview as withdrawReviewApi,
} from "./service";
import { readTemplatePreviewDetails } from "./template-preview-read";

/**
 * Server Actions for CMS Sites. Thin wrappers that forward the session cookie
 * and active-org header to api.saroh.in (via the service); the api resolves the
 * caller from the session and enforces org membership + write role. Client
 * components call these — never the api or the database directly.
 */

export async function createSite(input: CreateSiteInput) {
    return createSiteApi(input);
}

export async function saveDraftSections(
    siteId: string,
    pageId: string,
    sections: SectionInput[],
    /** The revision the editor loaded, so a stale save is refused (#285). */
    revision?: number,
) {
    return saveDraftSectionsApi(siteId, pageId, sections, revision);
}

/**
 * "Describe it" (plan U10): write one photo's description into the page's
 * draft through the same save the editor uses, against the revision just
 * read, so it waits for Publish like any edit and a teammate's newer save
 * is never overwritten.
 */
export async function describePhoto(
    siteId: string,
    pageId: string,
    sectionIndex: number,
    path: string,
    alt: string,
) {
    const draft = await getPageDraft(siteId, pageId);
    const sections = draft
        ? withPhotoDescription(draft.sections, sectionIndex, path, alt)
        : null;
    if (!draft || !sections) {
        return {
            ok: false as const,
            error: "This photo has moved or gone since the check. Open the page to describe it there.",
        };
    }
    return saveDraftSectionsApi(siteId, pageId, sections, draft.revision);
}

/** Leave a note on a section (#277). */
export async function createComment(
    siteId: string,
    /** A page's section, or a post (DEC-200 U8). */
    input: Parameters<typeof createCommentApi>[1],
) {
    return createCommentApi(siteId, input);
}

/**
 * Record a verdict (#277): on the draft, or on a test release's frozen
 * bytes when `testReleaseId` is given (T12).
 */
export async function createApproval(
    siteId: string,
    outcome: ReviewerVerdict,
    testReleaseId?: string,
    /** What needs changing, with CHANGES_REQUESTED (UX-043). */
    reason?: string,
) {
    return createApprovalApi(siteId, outcome, testReleaseId, reason);
}

/** Approve, or ask for changes on, waiting changes (DEC-226, U9). */
export async function recordChangeVerdict(
    siteId: string,
    units: string[],
    outcome: ReviewerVerdict,
    reason?: string,
) {
    return recordChangeVerdictApi(siteId, units, outcome, reason);
}

/** Take back the draft's open review request (UX-068). */
export async function withdrawReview(siteId: string) {
    return withdrawReviewApi(siteId);
}

/** Ask for a review (#278), of the draft or of a test release (T12). */
export async function requestReview(siteId: string, testReleaseId?: string) {
    return requestReviewApi(siteId, testReleaseId);
}

/**
 * `override`: an owner past "Publishing needs approval" (DEC-071).
 * `leaveOut`: change unit keys that stay in the draft (U8).
 */
export async function publishSite(
    siteId: string,
    override = false,
    leaveOut: string[] = [],
) {
    return publishSiteApi(siteId, override, leaveOut);
}

export async function updateSiteSettings(
    siteId: string,
    input: SiteSettingsInput,
) {
    return updateSiteSettingsApi(siteId, input);
}

/** Set the site's own icon from the library, or take it off (null). */
export async function saveSiteIcon(siteId: string, mediaId: string | null) {
    return saveSiteIconApi(siteId, mediaId);
}

/**
 * Today's restore: the version goes live again. Parked for the Website area
 * off (`restoresAsDraft`, owner 20 Nov 2026); on, it is restored as the draft.
 * `override`: an owner's restore past "Publishing needs approval"
 * (DEC-071, Q3), recorded as one.
 */
export async function restorePublication(
    siteId: string,
    publicationId: string,
    override = false,
    orgId?: string,
) {
    const write = () => restorePublicationApi(siteId, publicationId, override);
    return writeAsOrgIfSent(orgId, write);
}

/**
 * "Use this look with its starter content" (DEC-182): the look set and its
 * showcase template copied into the draft.
 */
export async function copyStarterContent(
    siteId: string,
    look: LookId | "classic",
    fill: boolean,
    /** A template's pages instead (DEC-216), its colours when `styleId`. */
    chosen?: { templateId: string; styleId?: string },
) {
    return copyStarterContentApi(siteId, look, fill, chosen);
}

/** The business's own details a template's preview draws (DEC-216). */
export async function readTemplatePreview() {
    return readTemplatePreviewDetails();
}

/** "Bring in my details" (DEC-182): sample words filled with the business's. */
export async function fillDetails(siteId: string) {
    return fillDetailsApi(siteId);
}

/** The draft's previous versions, newest first (DEC-182). */
export async function listDraftVersions(siteId: string) {
    return listDraftVersionsApi(siteId);
}

/** Roll the draft back to a previous version (DEC-182). */
export async function rollbackDraft(siteId: string, versionId: string) {
    return rollbackDraftApi(siteId, versionId);
}

/** One section of a previous version brought into the draft (DEC-182). */
export async function bringInSection(
    siteId: string,
    versionId: string,
    pageId: string,
    sectionKey: string,
) {
    return bringInSectionApi(siteId, versionId, pageId, sectionKey);
}

/** Put back the draft a starter copy replaced (DEC-182). */
export async function undoStarterContent(siteId: string, snapshotId: string) {
    return undoStarterContentApi(siteId, snapshotId);
}

export async function updateSiteStyle(siteId: string, style: SiteStyle) {
    return updateSiteStyleApi(siteId, style);
}

export async function updateSiteNavigation(
    siteId: string,
    navigation: SiteNavigation | null,
) {
    return updateSiteNavigationApi(siteId, navigation);
}

export async function updateSiteFooter(
    siteId: string,
    footer: SiteFooter | null,
) {
    return updateSiteFooterApi(siteId, footer);
}

export async function createPage(
    siteId: string,
    input: CreatePageInput,
    /** The tab's business, from a React Query screen (DEC-259). */
    orgId?: string,
) {
    const write = () => createPageApi(siteId, input);
    return writeAsOrgIfSent(orgId, write);
}

export async function updatePage(
    siteId: string,
    pageId: string,
    input: UpdatePageInput,
    orgId?: string,
) {
    const write = () => updatePageApi(siteId, pageId, input);
    return writeAsOrgIfSent(orgId, write);
}

export async function deletePage(
    siteId: string,
    pageId: string,
    orgId?: string,
) {
    const write = () => deletePageApi(siteId, pageId);
    return writeAsOrgIfSent(orgId, write);
}

export async function duplicatePage(
    siteId: string,
    pageId: string,
    orgId?: string,
) {
    const write = () => duplicatePageApi(siteId, pageId);
    return writeAsOrgIfSent(orgId, write);
}

/** Re-read the site's flags. Called after a save, so the dots settle with it. */
export async function getSiteFlags(siteId: string) {
    return getSiteFlagsApi(siteId);
}

export async function listComments(siteId: string, testReleaseId?: string) {
    return listCommentsApi(siteId, testReleaseId);
}

export async function getReviewState(siteId: string, testReleaseId?: string) {
    return getReviewStateApi(siteId, testReleaseId);
}

/** A reviewer opened a page in the editor (DEC-200, U9). */
export async function recordPageView(siteId: string, pageId: string) {
    return recordPageViewApi(siteId, pageId);
}

export async function setCommentResolved(
    siteId: string,
    commentId: string,
    resolved: boolean,
) {
    return setCommentResolvedApi(siteId, commentId, resolved);
}

/** Rewrite your own open note (DEC-200 U3). */
export async function updateCommentBody(
    siteId: string,
    commentId: string,
    body: string,
) {
    return updateCommentBodyApi(siteId, commentId, body);
}

/** Delete your own open note (DEC-200 U3). */
export async function deleteComment(siteId: string, commentId: string) {
    return deleteCommentApi(siteId, commentId);
}

export async function listPreviewLinks(siteId: string) {
    return listPreviewLinksApi(siteId);
}

export async function createPreviewLink(
    siteId: string,
    expiresInDays: PreviewLinkDays,
) {
    return createPreviewLinkApi(siteId, expiresInDays);
}

export async function revokePreviewLink(siteId: string, linkId: string) {
    return revokePreviewLinkApi(siteId, linkId);
}

/** Links and sharing: forward an old link of the merchant's to a page. */
export async function createSiteRedirect(
    siteId: string,
    input: { fromPath: string; toPath: string },
    orgId?: string,
) {
    const write = () => createSiteRedirectApi(siteId, input);
    return writeAsOrgIfSent(orgId, write);
}

export async function removeSiteRedirect(
    siteId: string,
    redirectId: string,
    orgId?: string,
) {
    const write = () => removeSiteRedirectApi(siteId, redirectId);
    return writeAsOrgIfSent(orgId, write);
}

/**
 * The shops a Visit us block can show (G8). A read, but the editor is a
 * client component and reaches the API only through an action.
 */
export async function listVisitPlacesForPicker(): Promise<VisitPlacesRead> {
    return listVisitPlaces();
}

/**
 * The products and collections a Product grid can pick from (G12). A read,
 * but the editor is a client component and reaches the API only through an
 * action.
 */
export async function listGridCatalogue(): Promise<GridCatalogueRead> {
    return readGridCatalogue();
}

/**
 * The plans on sale, by name, for a Plans block's Compare rows (DEC-228):
 * each row's cells are kept by plan id. Null when the read failed, so the
 * editor never calls a chosen plan gone because of it.
 */
export async function listPlansForCompare(): Promise<
    { id: string; name: string }[] | null
> {
    try {
        return (await listPlans())
            .filter((plan) => plan.status === "ACTIVE")
            .map(({ id, name }) => ({ id, name }));
    } catch {
        return null;
    }
}

/**
 * Turn "Publishing needs approval" on or off (DEC-071, T13). The owner's
 * alone, and it takes effect at once.
 */
export async function setPublishNeedsApproval(siteId: string, on: boolean) {
    return savePublishNeedsApproval(siteId, on);
}

/**
 * Save the site's verification codes, trackers or privacy page (DEC-108,
 * U7). Only extracted ids come here; it takes effect on the live site at
 * once.
 */
export async function saveSearchTracking(
    siteId: string,
    input: SearchTrackingSave,
) {
    return saveSearchTrackingApi(siteId, input);
}
