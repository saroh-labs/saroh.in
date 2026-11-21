"use server";

import type {
    PostCheckFlag,
    PostRevision,
    PostRevisionRow,
} from "@/lib/content/service";
import {
    checkPostWriting,
    getPostRevision,
    listPostRevisions,
} from "@/lib/content/service";

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

/** Publish post's price and link checks; null when they couldn't run. */
export async function readPostChecks(
    siteId: string,
    postId: string,
    content: string,
): Promise<PostCheckFlag[] | null> {
    try {
        const res = await checkPostWriting(siteId, postId, content);
        return res.ok ? res.data.flags : null;
    } catch {
        return null;
    }
}
