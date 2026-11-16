import type { CrmResult } from "@/lib/api/http";
import { destroy, getJson, mutate, orgBase } from "@/lib/api/http";
import type { CardSize, CardStyle } from "@/lib/share-item/share";

/**
 * A business's own posts (#1378): the API's `share-posts`, saved as
 * Create post's Your own post is written. Server-only; the API asks
 * `social:post` of every write.
 */

export interface OwnPost {
    id: string;
    headline: string | null;
    mediaId: string | null;
    style: CardStyle;
    size: CardSize;
    caption: string;
    linkPath: string;
    /** The picture on the API: `/public/share/own/<id>/image`. */
    imagePath: string;
    createdAt: string;
    updatedAt: string;
}

export interface OwnPostInput {
    headline?: string | null;
    mediaId?: string | null;
    style?: CardStyle;
    size?: CardSize;
    caption?: string;
    linkPath?: string;
}

export function createOwnPost(
    input: OwnPostInput,
): Promise<CrmResult<OwnPost>> {
    return mutate<OwnPost>(
        "/share-posts",
        "POST",
        input,
        "Couldn't save your post.",
    );
}

export function updateOwnPost(
    id: string,
    input: OwnPostInput,
): Promise<CrmResult<OwnPost>> {
    return mutate<OwnPost>(
        `/share-posts/${encodeURIComponent(id)}`,
        "PATCH",
        input,
        "Couldn't save your post.",
    );
}

/** The business's own posts, newest first (Social's Your posts). */
export async function listOwnPosts(): Promise<OwnPost[]> {
    const base = await orgBase();
    if (!base) return [];
    return (await getJson<OwnPost[]>(`${base}/share-posts`)) ?? [];
}

/** One own post, to reopen it; null when it isn't this business's. */
export async function getOwnPost(id: string): Promise<OwnPost | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<OwnPost>(`${base}/share-posts/${encodeURIComponent(id)}`);
}

export function deleteOwnPost(id: string): Promise<CrmResult<unknown>> {
    return destroy(
        `/share-posts/${encodeURIComponent(id)}`,
        "Couldn't delete your post.",
    );
}
