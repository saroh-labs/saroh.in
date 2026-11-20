import { toFailure } from "@/lib/api/failure";
import { apiFetch, getActiveOrgId, getJson, getList } from "@/lib/api/http";
import type { PlanRefusal } from "@/lib/billing/refusal";

/**
 * A site's writing (ADR-004, #209) — posts and post categories.
 *
 * These hung off a store until #209; a post belongs to the SITE it is
 * published on, so a business with a website and no shop can write. Forwards
 * the session cookie to api.saroh.in, which enforces the site policy
 * (`site:read` to read, `section:write` to write). Server-only.
 */

/** `/organizations/{org}/sites/{site}`, or null with no active organization. */
async function siteBase(siteId: string): Promise<string | null> {
    const orgId = await getActiveOrgId();
    return orgId ? `/organizations/${orgId}/sites/${siteId}` : null;
}

export type PostStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface Post {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    status: PostStatus;
    featured: boolean;
    image: string | null;
    publishedAt: string | null;
    createdAt: string;
    /**
     * When the post was last changed (#908). Absent from an API older than
     * #908; `postUpdatedIso` falls back to `createdAt`.
     */
    updatedAt?: string;
    category: { id: string; name: string } | null;
    author: string | null;
    /**
     * Whether the PUBLIC is being served this post (#232) — which `status`
     * alone cannot say, because a post edited since it went live is still
     * PUBLISHED and the live copy is the older one.
     */
    live: boolean;
}

export interface PostDetail {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    content: string;
    categoryId: string | null;
    featured: boolean;
    image: string | null;
    status: PostStatus;
    publishedAt: string | null;
    createdAt: string;
    author: string | null;
    /** Whether the public is being served this post (#232). */
    live: boolean;
    /** When the live copy was published, or null. */
    liveAt: string | null;
    /** The cover's description, and its own search and share fields (U17a). */
    imageAlt?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    shareImageUrl?: string | null;
    /** Publish post › Later: when it goes live, or null. */
    scheduledAt?: string | null;
    /** Links it was live at before; each forwards to the current one. */
    oldSlugs?: string[];
    /** What the public reads, for diffs against the draft; null when not live. */
    liveCopy?: PostLiveCopy | null;
}

/** The live copy of a post, as its current publication holds it (U17a). */
export interface PostLiveCopy {
    title: string;
    slug: string;
    excerpt: string | null;
    content: string;
    image: string | null;
    imageAlt: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    shareImageUrl: string | null;
    /** The category's name when it was published. */
    category: string | null;
    path: string | null;
    publishedAt: string | null;
}

/** Why a revision was kept (U17a). */
export type PostRevisionReason =
    "autosave" | "published" | "restored" | "ask_ai" | "not_published";

/** One row of a post's History, newest first. */
export interface PostRevisionRow {
    id: string;
    reason: PostRevisionReason;
    /** Why, in words: a schedule that didn't go live says why. */
    note: string | null;
    title: string;
    slug: string;
    createdAt: string;
    savedBy: { id: string; name: string | null } | null;
}

/** One revision in full, for Compare. */
export interface PostRevision extends PostRevisionRow {
    content: string;
    excerpt: string | null;
    image: string | null;
    imageAlt: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    shareImageUrl: string | null;
    categoryId: string | null;
    authorId: string | null;
}

export interface PostInput {
    title: string;
    slug?: string;
    excerpt?: string | null;
    content?: string;
    categoryId?: string | null;
    featured?: boolean;
    image?: string | null;
    status?: PostStatus;
    /** Absent leaves it alone; null clears it (U17a). */
    imageAlt?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    shareImageUrl?: string | null;
    /** A save that takes an Ask AI draft: always kept in History. */
    event?: "ask_ai";
}

export interface PostCategory {
    id: string;
    name: string;
    slug: string;
    _count: { posts: number };
}

export interface PostCategoryInput {
    name: string;
    slug?: string;
}

const RESULT_FIELDS = ["title", "slug", "name", "categoryId", "at"] as const;

export type ResultField = (typeof RESULT_FIELDS)[number];

export type Result<T = { id: string }> =
    | { ok: true; data: T }
    | {
          ok: false;
          error: string;
          field?: ResultField;
          /** Its plan refused it (U13): shown as the notice (U14). */
          plan?: PlanRefusal;
      };

/** No active organization: the same shape a failed write returns. */
function noOrg<T = { id: string }>(): Result<T> {
    return {
        ok: false,
        error: "No business is open. Choose one and try again.",
    };
}

async function mutate<T = { id: string }>(
    path: string,
    method: "POST" | "PUT" | "DELETE",
    body?: unknown,
): Promise<Result<T>> {
    const res = await apiFetch(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: (data ?? {}) as T };
    const failure = toFailure(data, "That didn't go through. Try again.");
    return {
        ...failure,
        field: RESULT_FIELDS.find((f) => f === failure.field),
    };
}

// ---- Posts ----

export async function listPosts(siteId: string): Promise<Post[]> {
    const base = await siteBase(siteId);
    return base ? getList<Post>(`${base}/posts`) : [];
}

export async function getPost(
    siteId: string,
    postId: string,
): Promise<PostDetail | null> {
    const base = await siteBase(siteId);
    return base ? getJson<PostDetail>(`${base}/posts/${postId}`) : null;
}

export async function createPost(siteId: string, input: PostInput) {
    const base = await siteBase(siteId);
    if (!base) return noOrg();
    return mutate(`${base}/posts`, "POST", input);
}

export async function updatePost(
    siteId: string,
    postId: string,
    input: PostInput,
) {
    const base = await siteBase(siteId);
    if (!base) return noOrg();
    return mutate(`${base}/posts/${postId}`, "PUT", input);
}

export async function deletePost(siteId: string, postId: string) {
    const base = await siteBase(siteId);
    if (!base) return noOrg();
    return mutate(`${base}/posts/${postId}`, "DELETE");
}

// ---- Post categories ----

export async function listPostCategories(
    siteId: string,
): Promise<PostCategory[]> {
    const base = await siteBase(siteId);
    return base ? getList<PostCategory>(`${base}/post-categories`) : [];
}

export async function createPostCategory(
    siteId: string,
    input: PostCategoryInput,
) {
    const base = await siteBase(siteId);
    if (!base) return noOrg();
    return mutate(`${base}/post-categories`, "POST", input);
}

export async function updatePostCategory(
    siteId: string,
    categoryId: string,
    input: PostCategoryInput,
) {
    const base = await siteBase(siteId);
    if (!base) return noOrg();
    return mutate(`${base}/post-categories/${categoryId}`, "PUT", input);
}

export async function deletePostCategory(siteId: string, categoryId: string) {
    const base = await siteBase(siteId);
    if (!base) return noOrg();
    return mutate(`${base}/post-categories/${categoryId}`, "DELETE");
}

/** Put this post on the site (#232). */
export async function publishPost(
    siteId: string,
    postId: string,
): Promise<Result<{ path: string }>> {
    const base = await siteBase(siteId);
    if (!base) return noOrg();
    return mutate<{ path: string }>(`${base}/posts/${postId}/publish`, "POST");
}

/** Take it off the site, keeping its history (#232). */
export async function unpublishPost(siteId: string, postId: string) {
    const base = await siteBase(siteId);
    if (!base) return noOrg();
    return mutate(`${base}/posts/${postId}/publish`, "DELETE");
}

/** Publish post › Later (U17a): `at` is an ISO instant, 5+ minutes away. */
export async function schedulePost(siteId: string, postId: string, at: string) {
    const base = await siteBase(siteId);
    if (!base) return noOrg<{ id: string; scheduledAt: string }>();
    return mutate<{ id: string; scheduledAt: string }>(
        `${base}/posts/${postId}/schedule`,
        "PUT",
        { at },
    );
}

/** Don't publish it later after all. */
export async function unschedulePost(siteId: string, postId: string) {
    const base = await siteBase(siteId);
    if (!base) return noOrg();
    return mutate(`${base}/posts/${postId}/schedule`, "DELETE");
}

/** A post's History, newest first (U17a). Empty when it can't be read. */
export async function listPostRevisions(
    siteId: string,
    postId: string,
): Promise<PostRevisionRow[]> {
    const base = await siteBase(siteId);
    if (!base) return [];
    const body = await getJson<{ revisions: PostRevisionRow[] }>(
        `${base}/posts/${postId}/revisions`,
    );
    return body?.revisions ?? [];
}

/** One revision in full, for Compare, or null. */
export async function getPostRevision(
    siteId: string,
    postId: string,
    revisionId: string,
): Promise<PostRevision | null> {
    const base = await siteBase(siteId);
    return base
        ? getJson<PostRevision>(
              `${base}/posts/${postId}/revisions/${revisionId}`,
          )
        : null;
}

/** Make a revision the draft; the draft as it was is kept first. */
export async function restorePostRevision(
    siteId: string,
    postId: string,
    revisionId: string,
) {
    const base = await siteBase(siteId);
    if (!base) return noOrg();
    return mutate(
        `${base}/posts/${postId}/revisions/${revisionId}/restore`,
        "POST",
    );
}
