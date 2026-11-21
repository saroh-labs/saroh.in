"use server";

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
): Promise<Result> {
    return createPostCategoryApi(storeId, input);
}

export async function updatePostCategory(
    storeId: string,
    categoryId: string,
    input: PostCategoryInput,
): Promise<Result> {
    return updatePostCategoryApi(storeId, categoryId, input);
}

export async function deletePostCategory(
    storeId: string,
    categoryId: string,
): Promise<Result> {
    return deletePostCategoryApi(storeId, categoryId);
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
