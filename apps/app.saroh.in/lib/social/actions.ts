"use server";

import type { OwnPostInput } from "./own-posts";
import { createOwnPost, updateOwnPost } from "./own-posts";

/**
 * Save an own post as it is written (#1378): the first save makes it, the
 * rest change it. Thin: the API decides who may and what a post may say.
 */
export async function saveOwnPost(id: string | null, input: OwnPostInput) {
    return id ? updateOwnPost(id, input) : createOwnPost(input);
}
