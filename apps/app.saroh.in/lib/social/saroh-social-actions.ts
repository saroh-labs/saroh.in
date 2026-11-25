"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import {
    cancelSocialPost,
    choosePage,
    createSocialPost,
    deleteSocialPost,
    disconnectChannel,
    getPostResults,
    postHeldNow,
    readPageChoices,
    requestMorePosts,
    retrySocialPost,
    startConnect,
    updateSocialPost,
} from "./saroh-social";
import type { ChannelKind, SocialPostInput } from "./saroh-social-types";

/**
 * Saroh Social's writes from the screens (U9 to U13). Thin: the API asks
 * `social:post`, `MODULE_SOCIAL` and the plan of each. Social's screen
 * passes the tab's business last (`writeAsOrg`), refusing a tab whose
 * business has since changed; its reads are React Query's
 * (`lib/social/queries.ts`, DEC-259).
 */

const asOrg = <R>(orgId: string | undefined, write: () => Promise<R>) =>
    orgId ? writeAsOrg(orgId, write) : write();

export async function connectChannel(kind: ChannelKind) {
    return startConnect(kind);
}

export async function pickPage(
    kind: ChannelKind,
    choiceId: string,
    pageId: string,
    orgId?: string,
) {
    return asOrg(orgId, () => choosePage(kind, choiceId, pageId));
}

export async function pageChoices(kind: ChannelKind, choiceId: string) {
    return readPageChoices(kind, choiceId);
}

export async function postHeld(kind: ChannelKind, orgId?: string) {
    return asOrg(orgId, () => postHeldNow(kind));
}

export async function disconnect(kind: ChannelKind, orgId?: string) {
    return asOrg(orgId, () => disconnectChannel(kind));
}

export async function savePost(
    id: string | null,
    input: SocialPostInput,
    orgId?: string,
) {
    return asOrg(orgId, () =>
        id ? updateSocialPost(id, input) : createSocialPost(input),
    );
}

export async function cancelPost(id: string, orgId?: string) {
    return asOrg(orgId, () => cancelSocialPost(id));
}

export async function tryPostAgain(
    id: string,
    publishAt?: string,
    orgId?: string,
) {
    return asOrg(orgId, () => retrySocialPost(id, publishAt));
}

export async function deletePost(id: string, orgId?: string) {
    return asOrg(orgId, () => deleteSocialPost(id));
}

export async function askForMorePosts() {
    return requestMorePosts();
}

export async function postResults(id: string) {
    return getPostResults(id);
}
