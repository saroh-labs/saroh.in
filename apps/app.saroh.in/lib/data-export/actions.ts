"use server";

import { revalidatePath } from "next/cache";

import { dataExportLink, requestDataExport } from "./service";

/**
 * What Settings › Your data calls (DEC-120). Thin: who may ask, one at a
 * time and what a link is are all the API's.
 */
export async function startDataExport() {
    const result = await requestDataExport();
    if (result.ok) revalidatePath("/settings/data");
    return result;
}

/** A signed link for the browser to open; it works for a few minutes. */
export async function getDataExportLink(exportId: string) {
    return dataExportLink(exportId);
}
