"use server";

import { mutate } from "@/lib/api/http";

import type { SiteLinkRead } from "./link-maker";

/**
 * The business's own links on Insights › Where customers come from
 * (DEC-181, #1099): make one, archive one, and Archive's Undo. The API
 * checks the label, the site and `site:update`, and writes each to
 * Activity. Nothing is revalidated: the list changes itself, and the next
 * read of the page has the same.
 */

export async function makeSiteLink(input: {
    siteId: string;
    name: string;
    label: string;
}) {
    return mutate<SiteLinkRead>(
        "/analytics/links",
        "POST",
        input,
        "Couldn't make that link.",
    );
}

export async function archiveSiteLink(linkId: string) {
    return mutate<SiteLinkRead>(
        `/analytics/links/${encodeURIComponent(linkId)}/archive`,
        "POST",
        {},
        "Couldn't archive that link.",
    );
}

export async function restoreSiteLink(linkId: string) {
    return mutate<SiteLinkRead>(
        `/analytics/links/${encodeURIComponent(linkId)}/restore`,
        "POST",
        {},
        "Couldn't bring that link back.",
    );
}
