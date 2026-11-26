"use server";

import { writeAsOrg, writeAsOrgIfSent } from "@/lib/api/assert-active-org";

import type { OwnPostInput } from "./own-posts";
import { createOwnPost, deleteOwnPost, updateOwnPost } from "./own-posts";

/**
 * Save an own post as it is written (#1378): the first save makes it, the
 * rest change it. Thin: the API decides who may and what a post may say.
 */
export async function saveOwnPost(
    id: string | null,
    input: OwnPostInput,
    /** The tab's business (DEC-259): a new post never lands in another. */
    orgId?: string,
) {
    return writeAsOrgIfSent(orgId, () =>
        id ? updateOwnPost(id, input) : createOwnPost(input),
    );
}

/**
 * Delete an own post (Your posts, "Delete this draft"). Social's Your
 * posts passes the tab's business last (`writeAsOrg`).
 */
export async function removeOwnPost(id: string, orgId?: string) {
    return orgId
        ? writeAsOrg(orgId, () => deleteOwnPost(id))
        : deleteOwnPost(id);
}
