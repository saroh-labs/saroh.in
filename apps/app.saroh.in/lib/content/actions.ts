"use server";

import { writeAsOrgIfSent } from "@/lib/api/assert-active-org";

import type { PostCategoryInput, PostInput, Result } from "./service";
import {
    approvePost as approvePostApi,
    askPostChanges as askPostChangesApi,
    createPost as createPostApi,
    createPostCategory as createPostCategoryApi,
    deletePost as deletePostApi,
    deletePostCategory as deletePostCategoryApi,
    publishPost as publishPostApi,
    requestPostApproval as requestPostApprovalApi,
    restorePostRevision as restorePostRevisionApi,
    schedulePost as schedulePostApi,
    unpublishPost as unpublishPostApi,
    unschedulePost as unschedulePostApi,
    updatePost as updatePostApi,
    updatePostCategory as updatePostCategoryApi,
} from "./service";

/** Server Actions for content — forward the cookie to api (write = owner/EDITOR+). */

export async function createPost(
    storeId: string,
    input: PostInput,
): Promise<Result> {
    return createPostApi(storeId, input);
}

export async function updatePost(
    storeId: string,
    postId: string,
    input: PostInput,
): Promise<Result> {
    return updatePostApi(storeId, postId, input);
}

export async function deletePost(
    storeId: string,
    postId: string,
): Promise<Result> {
    return deletePostApi(storeId, postId);
}

export async function createPostCategory(
    storeId: string,
    input: PostCategoryInput,
    /** The tab's business, from a React Query screen (DEC-259). */
    orgId?: string,
): Promise<Result> {
    const write = () => createPostCategoryApi(storeId, input);
    return writeAsOrgIfSent(orgId, write);
}

export async function updatePostCategory(
    storeId: string,
    categoryId: string,
    input: PostCategoryInput,
    orgId?: string,
): Promise<Result> {
    const write = () => updatePostCategoryApi(storeId, categoryId, input);
    return writeAsOrgIfSent(orgId, write);
}

export async function deletePostCategory(
    storeId: string,
    categoryId: string,
    orgId?: string,
): Promise<Result> {
    const write = () => deletePostCategoryApi(storeId, categoryId);
    return writeAsOrgIfSent(orgId, write);
}

/** Put a post on the site (#232). */
export async function publishPost(siteId: string, postId: string) {
    return publishPostApi(siteId, postId);
}

/** Take it off the site, keeping its history (#232). */
export async function unpublishPost(siteId: string, postId: string) {
    return unpublishPostApi(siteId, postId);
}

/** Publish post › Later (U17a). */
export async function schedulePost(siteId: string, postId: string, at: string) {
    return schedulePostApi(siteId, postId, at);
}

/** Don't publish it later after all (U17a). */
export async function unschedulePost(siteId: string, postId: string) {
    return unschedulePostApi(siteId, postId);
}

/** Make a revision the draft (U17a). */
export async function restorePostRevision(
    siteId: string,
    postId: string,
    revisionId: string,
) {
    return restorePostRevisionApi(siteId, postId, revisionId);
}

/** Send for approval (O7). */
export async function requestPostApproval(
    siteId: string,
    postId: string,
    input: { note: string | null; at?: string },
) {
    return requestPostApprovalApi(siteId, postId, input);
}

/** Approve a post (O7). */
export async function approvePost(
    siteId: string,
    postId: string,
    fingerprint: string,
) {
    return approvePostApi(siteId, postId, fingerprint);
}

/** Ask for changes on a post (O7, UX-043). */
export async function askPostChanges(
    siteId: string,
    postId: string,
    reason: string,
    fingerprint: string,
) {
    return askPostChangesApi(siteId, postId, reason, fingerprint);
}
