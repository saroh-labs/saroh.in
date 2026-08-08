import { apiFetch, getJson, getList } from "@/lib/api/http";

/**
 * Content (blog) data access for app.saroh.in — posts and post categories.
 * Forwards the session cookie to api.saroh.in, which enforces store membership
 * (read = access, write = owner/EDITOR+). Server-only.
 */

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
    | { ok: true; data: T }
    | { ok: false; error: string; field?: ResultField };

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

export function listPosts(storeId: string): Promise<Post[]> {
    return getList<Post>(`/stores/${storeId}/posts`);
}

export function getPost(
    storeId: string,
    postId: string,
): Promise<PostDetail | null> {
    return getJson<PostDetail>(`/stores/${storeId}/posts/${postId}`);
}

export function createPost(storeId: string, input: PostInput) {
    return mutate(`/stores/${storeId}/posts`, "POST", input);
}

export function updatePost(storeId: string, postId: string, input: PostInput) {
    return mutate(`/stores/${storeId}/posts/${postId}`, "PUT", input);
}

export function deletePost(storeId: string, postId: string) {
    return mutate(`/stores/${storeId}/posts/${postId}`, "DELETE");
}

// ---- Post categories ----

export function listPostCategories(storeId: string): Promise<PostCategory[]> {
    return getList<PostCategory>(`/stores/${storeId}/post-categories`);
}

export function createPostCategory(storeId: string, input: PostCategoryInput) {
    return mutate(`/stores/${storeId}/post-categories`, "POST", input);
}

export function updatePostCategory(
    storeId: string,
    categoryId: string,
    input: PostCategoryInput,
) {
    return mutate(
        `/stores/${storeId}/post-categories/${categoryId}`,
        "PUT",
        input,
    );
}

export function deletePostCategory(storeId: string, categoryId: string) {
    return mutate(`/stores/${storeId}/post-categories/${categoryId}`, "DELETE");
}
