"use server";

import type { VisitPlacesRead } from "@/lib/stores/storefronts";
import { listVisitPlaces } from "@/lib/stores/storefronts";

import type { GridCatalogueRead } from "./grid-catalogue";
import { readGridCatalogue } from "./grid-catalogue";
import { savePublishNeedsApproval } from "./publish-approval-read";
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
    createApproval as createApprovalApi,
    createComment as createCommentApi,
    createPage as createPageApi,
    createPreviewLink as createPreviewLinkApi,
    createSite as createSiteApi,
    deletePage as deletePageApi,
    getReviewState as getReviewStateApi,
    getSiteFlags as getSiteFlagsApi,
    listComments as listCommentsApi,
    listPreviewLinks as listPreviewLinksApi,
    publishSite as publishSiteApi,
    requestReview as requestReviewApi,
    restorePublication as restorePublicationApi,
    revokePreviewLink as revokePreviewLinkApi,
    saveDraftSections as saveDraftSectionsApi,
    setCommentResolved as setCommentResolvedApi,
    updatePage as updatePageApi,
    updateSiteFooter as updateSiteFooterApi,
    updateSiteNavigation as updateSiteNavigationApi,
    updateSiteSettings as updateSiteSettingsApi,
    updateSiteStyle as updateSiteStyleApi,
} from "./service";

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

/** Leave a note on a section (#277). */
export async function createComment(
    siteId: string,
    input: {
        pageId: string;
        sectionKey: string;
        body: string;
        testReleaseId?: string;
    },
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
) {
    return createApprovalApi(siteId, outcome, testReleaseId);
}

/** Ask for a review (#278), of the draft or of a test release (T12). */
export async function requestReview(siteId: string, testReleaseId?: string) {
    return requestReviewApi(siteId, testReleaseId);
}

/** `override`: an owner past "Publishing needs approval" (DEC-071). */
export async function publishSite(siteId: string, override = false) {
    return publishSiteApi(siteId, override);
}

export async function updateSiteSettings(
    siteId: string,
    input: SiteSettingsInput,
) {
    return updateSiteSettingsApi(siteId, input);
}

/**
 * `override`: an owner's restore past "Publishing needs approval"
 * (DEC-071, Q3), recorded as one.
 */
export async function restorePublication(
    siteId: string,
    publicationId: string,
    override = false,
) {
    return restorePublicationApi(siteId, publicationId, override);
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

export async function createPage(siteId: string, input: CreatePageInput) {
    return createPageApi(siteId, input);
}

export async function updatePage(
    siteId: string,
    pageId: string,
    input: UpdatePageInput,
) {
    return updatePageApi(siteId, pageId, input);
}

export async function deletePage(siteId: string, pageId: string) {
    return deletePageApi(siteId, pageId);
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

export async function setCommentResolved(
    siteId: string,
    commentId: string,
    resolved: boolean,
) {
    return setCommentResolvedApi(siteId, commentId, resolved);
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
 * Turn "Publishing needs approval" on or off (DEC-071, T13). The owner's
 * alone, and it takes effect at once.
 */
export async function setPublishNeedsApproval(siteId: string, on: boolean) {
    return savePublishNeedsApproval(siteId, on);
}
