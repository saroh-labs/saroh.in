"use server";

import type { CreateSiteInput, SectionInput } from "./service";
import {
    createSite as createSiteApi,
    publishSite as publishSiteApi,
    saveDraftSections as saveDraftSectionsApi,
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
