"use server";

import type { PostResult, ReviewInput } from "@/lib/reviews";
import { postReview } from "@/lib/reviews";

/**
 * The review form's submit, run on this server so the API is reached
 * server-to-server. It adds nothing of its own: the API decides everything
 * from the token.
 */
export async function submitReview(
    token: string,
    input: ReviewInput,
): Promise<PostResult> {
    return postReview(token, input);
}
