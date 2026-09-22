"use server";

import { revalidatePath } from "next/cache";

import {
    inviteReviews as inviteReviewsApi,
    replyToReview as replyToReviewApi,
    setReviewHidden as setReviewHiddenApi,
} from "./service";

/**
 * Thin: the API decides who may reply, hide or invite. Each revalidates the
 * whole layout — a reply or hide clears a notification, which the rail
 * counts.
 */

export async function inviteReviews(orderIds: string[]) {
    const res = await inviteReviewsApi(orderIds);
    if (res.ok) revalidatePath("/", "layout");
    return res;
}

export async function replyToReview(id: string, reply: string) {
    const res = await replyToReviewApi(id, reply);
    if (res.ok) revalidatePath("/", "layout");
    return res;
}

export async function setReviewHidden(id: string, hidden: boolean) {
    const res = await setReviewHiddenApi(id, hidden);
    if (res.ok) revalidatePath("/", "layout");
    return res;
}
