import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import type { CrmResult } from "@/lib/api/http";
import { apiFetch, destroy, getJson, mutate, orgBase } from "@/lib/api/http";

import type {
    ChannelKind,
    PageChoice,
    PostFilter,
    PostResults,
    Read,
    SocialAccess,
    SocialChannel,
    SocialPost,
    SocialPostInput,
} from "./saroh-social-types";
import { UNAVAILABLE } from "./saroh-social-types";

/**
 * Saroh Social (plan saroh-social 2026-11-18-001, U9 to U13): what the
 * API's `organizations/:id/social` answers, read and written on the server.
 * The API decides everything (the permission, `MODULE_SOCIAL`, the plan,
 * the month's count); this only carries it.
 */

const path = (kind: ChannelKind) => kind.toLowerCase();

/**
 * Whether Saroh Social is open to this business. `unavailable` when it
 * isn't rolled out (the API answers 404 then, as if it weren't there),
 * and `null` when it couldn't be asked: never drawn as unlocked.
 */
export const readSocialAccess = cache(
    async function readSocialAccess(): Promise<SocialAccess | null> {
        try {
            const base = await orgBase();
            if (!base) return null;
            const res = await apiFetch(`${base}/social`);
            if (res.status === 404) return UNAVAILABLE;
            if (!res.ok) return null;
            return (await res.json()) as SocialAccess;
        } catch (error) {
            unstable_rethrow(error);
            return null;
        }
    },
);

async function read<T>(suffix: string): Promise<Read<T>> {
    const base = await orgBase();
    if (!base) return { ok: false };
    try {
        const data = await getJson<T>(`${base}/social${suffix}`);
        return data === null ? { ok: false } : { ok: true, data };
    } catch (error) {
        unstable_rethrow(error);
        return { ok: false };
    }
}

export const listChannels = () => read<SocialChannel[]>("/channels");

export function listSocialPosts(
    q: { status?: PostFilter; from?: string; to?: string } = {},
) {
    const qs = new URLSearchParams(
        Object.entries(q).filter((e): e is [string, string] => Boolean(e[1])),
    ).toString();
    return read<SocialPost[]>(`/posts${qs ? `?${qs}` : ""}`);
}

export const getSocialPost = (id: string) =>
    read<SocialPost>(`/posts/${encodeURIComponent(id)}`);

export const getPostResults = (id: string) =>
    read<PostResults>(`/posts/${encodeURIComponent(id)}/results`);

export const readPageChoices = (choiceId: string) =>
    read<PageChoice[]>(
        `/channels/facebook/choices/${encodeURIComponent(choiceId)}`,
    );

// The writes. Each says its own sentence when the API gives none.

export const startConnect = (kind: ChannelKind) =>
    mutate<{ url: string }>(
        `/social/channels/${path(kind)}/connect`,
        "POST",
        {},
        "Couldn't start connecting. Try again.",
    );

export const choosePage = (choiceId: string, pageId: string) =>
    mutate<SocialChannel[]>(
        `/social/channels/facebook/choices/${encodeURIComponent(choiceId)}`,
        "POST",
        { pageId },
        "Couldn't connect that Page. Try again.",
    );

export const postHeldNow = (kind: ChannelKind) =>
    mutate<{ queued: number }>(
        `/social/channels/${path(kind)}/retry`,
        "POST",
        {},
        "Couldn't post them. Try again.",
    );

export const disconnectChannel = (kind: ChannelKind) =>
    destroy<unknown>(
        `/social/channels/${path(kind)}`,
        "Couldn't disconnect it. Try again.",
    );

export const createSocialPost = (input: SocialPostInput) =>
    mutate<SocialPost>(
        "/social/posts",
        "POST",
        input,
        "Couldn't save the post. Try again.",
    );

export const updateSocialPost = (id: string, input: SocialPostInput) =>
    mutate<SocialPost>(
        `/social/posts/${encodeURIComponent(id)}`,
        "PATCH",
        input,
        "Couldn't change the post. Try again.",
    );

export const cancelSocialPost = (id: string) =>
    mutate<SocialPost>(
        `/social/posts/${encodeURIComponent(id)}/cancel`,
        "POST",
        {},
        "Couldn't cancel the post. Try again.",
    );

export const retrySocialPost = (id: string, publishAt?: string) =>
    mutate<SocialPost>(
        `/social/posts/${encodeURIComponent(id)}/retry`,
        "POST",
        publishAt ? { publishAt } : {},
        "Couldn't try it again. Try again in a minute.",
    );

export const deleteSocialPost = (id: string) =>
    destroy<unknown>(
        `/social/posts/${encodeURIComponent(id)}`,
        "Couldn't delete the post. Try again.",
    );

export const requestMorePosts = () =>
    mutate<{ requested: true }>(
        "/social/posts/request-more",
        "POST",
        {},
        "Couldn't send that. Try again.",
    );

export type * from "./saroh-social-types";
export type { CrmResult };
