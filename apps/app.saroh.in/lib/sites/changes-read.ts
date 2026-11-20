"use server";

import { getSiteChanges } from "./service";

/**
 * What publishing would change, by who changed it (U7), for the Publish
 * sheet (U11) to read when it opens. Throws on a failed read: the sheet
 * says it couldn't list them and offers Try again.
 */
export async function readSiteChanges(siteId: string) {
    return getSiteChanges(siteId);
}
