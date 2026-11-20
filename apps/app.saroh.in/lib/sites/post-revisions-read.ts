"use server";

import type { PostRevision, PostRevisionRow } from "@/lib/content/service";
import { getPostRevision, listPostRevisions } from "@/lib/content/service";

/**
 * A post's History for the editor's client pieces (plan U17, KTD-E4):
 * `listPostRevisions` and `getPostRevision` as Server Actions that never
 * throw, so a failed read says so instead of reading as "no versions".
 */
export async function readPostRevisions(
    siteId: string,
    postId: string,
): Promise<{ ok: true; rows: PostRevisionRow[] } | { ok: false }> {
    try {
        return { ok: true, rows: await listPostRevisions(siteId, postId) };
    } catch {
        return { ok: false };
    }
}

/** One version in full, for Compare; null when it can't be read. */
export async function readPostRevision(
    siteId: string,
    postId: string,
    revisionId: string,
): Promise<PostRevision | null> {
    try {
        return await getPostRevision(siteId, postId, revisionId);
    } catch {
        return null;
    }
}
