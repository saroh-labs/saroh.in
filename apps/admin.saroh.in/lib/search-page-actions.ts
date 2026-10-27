"use server";

import { revalidatePath } from "next/cache";

import type { ControlPlaneResult } from "./control-plane";
import { adminWrite } from "./control-plane";
import type { PageAction, SearchPageRecord } from "./search-page-words";

/**
 * Publish, unpublish, archive or restore search pages (DEC-193): one call
 * for every page, all or none. The API checks `search-pages:publish`,
 * refuses with a 409 naming the paths it can't move, records history and
 * the audit trail, and queues the site's rebuild.
 */
export async function searchPageAction(
    action: PageAction,
    paths: string[],
): Promise<
    ControlPlaneResult<{ pages: SearchPageRecord[]; rebuildQueued: boolean }>
> {
    const result = await adminWrite<{
        pages: SearchPageRecord[];
        rebuildQueued: boolean;
    }>(
        "/search-pages/actions",
        "POST",
        { action, paths },
        "Couldn't change the pages. Nothing was changed.",
    );
    if (result.ok) revalidatePath("/search-pages", "layout");
    return result;
}
