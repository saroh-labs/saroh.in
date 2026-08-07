import type { MDXRemoteProps } from "next-mdx-remote";

/**
 * Storefront/blog data for the public site renderer.
 *
 * Per the single-backend refactor, only api.saroh.in may touch the database.
 * saroh.app is a public renderer scaffold that is not yet rebuilt against
 * api, so these fetchers are DB-free stubs: they return no data (sites render
 * notFound / empty) until api exposes storefront endpoints. Wire them to
 * `fetch(`${API_URL}/sites/...`)` when those land — the signatures and the
 * types below are the contract the pages already build against.
 */

export interface SiteUser {
    name: string | null;
    username: string | null;
    gh_username: string | null;
    image: string | null;
}

export interface SiteData {
    name: string | null;
    description: string | null;
    image: string | null;
    logo: string | null;
    font: string;
    subdomain: string | null;
    customDomain: string | null;
    message404: string | null;
    user: SiteUser | null;
}

export interface PostMeta {
    slug: string;
    title: string | null;
    description: string | null;
    image: string | null;
    imageBlurhash: string | null;
    createdAt: Date;
}

export interface PostData {
    title: string | null;
    description: string | null;
    createdAt: Date;
    mdxSource: MDXRemoteProps;
    adjacentPosts: PostMeta[];
    site: { user: SiteUser | null } | null;
}

export function getSiteData(_domain: string): Promise<SiteData | null> {
    // TODO: GET ${API_URL}/sites/by-domain/:domain
    return Promise.resolve(null);
}

export function getPostsForSite(_domain: string): Promise<PostMeta[]> {
    // TODO: GET ${API_URL}/sites/by-domain/:domain/posts
    return Promise.resolve([]);
}

export function getPostData(
    _domain: string,
    _slug: string,
): Promise<PostData | null> {
    // TODO: GET ${API_URL}/sites/by-domain/:domain/posts/:slug
    return Promise.resolve(null);
}
