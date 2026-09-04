"use server";

import type {
    CreateSiteInput,
    PreviewLinkDays,
    SectionInput,
    SiteFooter,
    SiteNavigation,
    SiteSettingsInput,
    SiteStyle,
} from "./service";
import {
    createPage as createPageApi,
    createPreviewLink as createPreviewLinkApi,
    createSite as createSiteApi,
    deletePage as deletePageApi,
    getReviewState as getReviewStateApi,
    getSiteFlags as getSiteFlagsApi,
    listComments as listCommentsApi,
    listPreviewLinks as listPreviewLinksApi,
    publishSite as publishSiteApi,
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
) {
    return saveDraftSectionsApi(siteId, pageId, sections);
}

export async function publishSite(siteId: string) {
    return publishSiteApi(siteId);
}

export async function updateSiteSettings(
    siteId: string,
    input: SiteSettingsInput,
) {
    return updateSiteSettingsApi(siteId, input);
}

export async function restorePublication(
    siteId: string,
    publicationId: string,
) {
    return restorePublicationApi(siteId, publicationId);
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
    input: { title: string; path: string },
) {
    return createPageApi(siteId, input);
}

export async function updatePage(
    siteId: string,
    pageId: string,
    input: { title?: string; path?: string; hidden?: boolean },
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

export async function listComments(siteId: string) {
    return listCommentsApi(siteId);
}

export async function getReviewState(siteId: string) {
    return getReviewStateApi(siteId);
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
