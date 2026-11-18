"use server";

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
 * `social:post`, `MODULE_SOCIAL` and the plan of each.
 */

export async function connectChannel(kind: ChannelKind) {
    return startConnect(kind);
}

export async function pickPage(
    kind: ChannelKind,
    choiceId: string,
    pageId: string,
) {
    return choosePage(kind, choiceId, pageId);
}

export async function pageChoices(kind: ChannelKind, choiceId: string) {
    return readPageChoices(kind, choiceId);
}

export async function postHeld(kind: ChannelKind) {
    return postHeldNow(kind);
}

export async function disconnect(kind: ChannelKind) {
    return disconnectChannel(kind);
}

export async function savePost(id: string | null, input: SocialPostInput) {
    return id ? updateSocialPost(id, input) : createSocialPost(input);
}

export async function cancelPost(id: string) {
    return cancelSocialPost(id);
}

export async function tryPostAgain(id: string, publishAt?: string) {
    return retrySocialPost(id, publishAt);
}

export async function deletePost(id: string) {
    return deleteSocialPost(id);
}

export async function askForMorePosts() {
    return requestMorePosts();
}

export async function postResults(id: string) {
    return getPostResults(id);
}
