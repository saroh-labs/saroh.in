import { apiFetch, getActiveOrgId, getJson, getList } from "@/lib/api/http";

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
    category: { id: string; name: string } | null;
    author: string | null;
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

export type ResultField = "title" | "slug" | "name" | "categoryId";

export type Result<T = { id: string }> =
    { ok: true; data: T } | { ok: false; error: string; field?: ResultField };

/** No active organization: the same shape a failed write returns. */
function noOrg<T = { id: string }>(): Result<T> {
    return { ok: false, error: "No active organization." };
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
    const data = (await res.json().catch(() => null)) as
        | (Record<string, unknown> & {
              message?: string;
              field?: ResultField;
          })
        | null;
    if (res.ok) return { ok: true, data: (data ?? {}) as T };
    return {
        ok: false,
        error: data?.message ?? "Something went wrong",
        field: data?.field,
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
