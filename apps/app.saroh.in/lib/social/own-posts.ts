import type { CrmResult } from "@/lib/api/http";
import { mutate } from "@/lib/api/http";
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
