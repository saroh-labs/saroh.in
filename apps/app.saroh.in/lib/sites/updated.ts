/**
 * The "Updated" dates on the Website tabs (#908): when a page or a post was
 * last changed, not when it went out.
 *
 * Posts used to show `publishedAt ?? createdAt`, which never moved after the
 * first publish, so a post edited this morning read as untouched since March.
 */

/** A page's last change, or null from an API that doesn't send it yet. */
export function pageUpdatedIso(page: { updatedAt?: string }): string | null {
    return page.updatedAt ?? null;
}

/** A post's last change; its creation from an API older than #908. */
export function postUpdatedIso(post: {
    updatedAt?: string;
    createdAt: string;
}): string {
    return post.updatedAt ?? post.createdAt;
}
