"use server";

import { getSiteChanges } from "./service";
import { websiteAreaOn } from "./website-area-switch";

/**
 * What publishing would change, by who changed it (U7), for the Publish
 * sheet (U11) to read when it opens. Throws on a failed read: the sheet
 * says it couldn't list them and offers Try again.
 */
export async function readSiteChanges(siteId: string) {
    // Off (DEC-240) the api has no such route: the sheet says what goes
    // live as it did before.
    if (!(await websiteAreaOn())) return null;
    return getSiteChanges(siteId);
}
