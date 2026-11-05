"use server";

import { revalidatePath } from "next/cache";

import type { ControlPlaneResult } from "./control-plane";
import { adminWrite } from "./control-plane";
import type { PageAction, SearchPageRecord } from "./search-page-words";

/**
 * Publish, unpublish, archive or restore search pages (DEC-193): one call
 * for every page, all or none. The API checks `search-pages:publish`,
 * refuses with a 409 naming the paths it can't move, records history and
 * the audit trail. Nothing rebuilds: `deploySearchPages` sends every
 * staged change to the site in one rebuild (R13).
 */
export async function searchPageAction(
    action: PageAction,
    paths: string[],
): Promise<ControlPlaneResult<{ pages: SearchPageRecord[] }>> {
    const result = await adminWrite<{ pages: SearchPageRecord[] }>(
        "/search-pages/actions",
        "POST",
        { action, paths },
        "Couldn't change the pages. Nothing was changed.",
    );
    if (result.ok) revalidatePath("/search-pages", "layout");
    return result;
}

/**
 * Deploy changes (R13): every staged page goes on or off the site in one
 * rebuild. A 409 says nothing is waiting.
 */
export async function deploySearchPages(): Promise<
    ControlPlaneResult<{ paths: string[]; rebuildQueued: boolean }>
> {
    const result = await adminWrite<{
        paths: string[];
        rebuildQueued: boolean;
    }>(
        "/search-pages/deploy",
        "POST",
        {},
        "Couldn't deploy the changes. Nothing was changed.",
    );
    if (result.ok) revalidatePath("/search-pages", "layout");
    return result;
}
