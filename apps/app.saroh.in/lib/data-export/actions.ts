"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import { dataExportLink, requestDataExport } from "./service";

/**
 * What Settings › Your data calls (DEC-120). Thin: who may ask, one at a
 * time and what a link is are all the API's. On React Query (DEC-259) the
 * tab's business comes last (`writeAsOrg`) and nothing is revalidated:
 * the tab reads its own query again.
 */
export async function startDataExport(orgId?: string) {
    return orgId
        ? writeAsOrg(orgId, () => requestDataExport())
        : requestDataExport();
}

/**
 * A signed link for the browser to open; it works for a few minutes, so it
 * is opened at once and never kept in a read or the cache.
 */
export async function getDataExportLink(exportId: string, orgId?: string) {
    if (orgId) return writeAsOrg(orgId, () => dataExportLink(exportId));
    return dataExportLink(exportId);
}
