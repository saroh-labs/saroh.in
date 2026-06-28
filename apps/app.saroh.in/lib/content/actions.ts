"use server";

import {
    createPost as createPostApi,
    createPostCategory as createPostCategoryApi,
    deletePost as deletePostApi,
    deletePostCategory as deletePostCategoryApi,
    type PostCategoryInput,
    type PostInput,
    type Result,
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
