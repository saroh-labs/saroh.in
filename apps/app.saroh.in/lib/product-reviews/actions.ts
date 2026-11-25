"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import {
    inviteReviews as inviteReviewsApi,
    replyToReview as replyToReviewApi,
    setReviewHidden as setReviewHiddenApi,
} from "./service";

/**
 * Thin: the API decides who may reply, hide or invite. Every caller is on
 * React Query (DEC-259) and reads itself again (`reviewsSaved`, the bell
 * included); the tab's business goes last (`writeAsOrg`), refusing a tab
 * whose business has since changed. Nothing is revalidated.
 */

const asOrg = <R>(orgId: string | undefined, write: () => Promise<R>) =>
    orgId ? writeAsOrg(orgId, write) : write();

export async function inviteReviews(orderIds: string[], orgId?: string) {
    return asOrg(orgId, () => inviteReviewsApi(orderIds));
}

export async function replyToReview(id: string, reply: string, orgId?: string) {
    return asOrg(orgId, () => replyToReviewApi(id, reply));
}

export async function setReviewHidden(
    id: string,
    hidden: boolean,
    orgId?: string,
) {
    return asOrg(orgId, () => setReviewHiddenApi(id, hidden));
}
