import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import {
    PostArticle,
    PostNeighbours,
    postNeighbours,
} from "@/components/post-view";
import {
    findRedirect,
    getPublishedPost,
    getSiteForHost,
    getSiteForPage,
    postsPrefix,
    readPublishedPosts,
    shareImages,
    withQuery,
} from "@/lib/publication";
import { canonical, titled } from "@/lib/site-meta";
import { shareable } from "@/lib/test-metadata";

/**
 * One published post (#232), at `/<prefix>/<slug>` — the prefix being whatever
 * the merchant called their writing.
 *
 * Two segments deep, and the first must BE the prefix: anything else is a 404
 * rather than a guess, so this route can never shadow a page. What it serves is
 * the post's current publication and nothing else, which is the same rule the
 * page routes follow — the public reads only what publish wrote.
 */

export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string; slug: string; postSlug: string }>;
}): Promise<Metadata | null> {
    const { domain, slug, postSlug } = await params;
    const resolved = await getSiteForHost(domain);
    if (!resolved?.siteId || slug !== postsPrefix(resolved.snapshot)) {
        return null;
    }

    const post = await getPublishedPost(resolved.siteId, postSlug);
    if (!post) return null;

    const name = resolved.snapshot.site.name;
    const description = post.excerpt?.trim() ? post.excerpt : undefined;
    // The post's own picture is its share card when it has one; otherwise the
    // site's, so a post is never shared with no card at all.
    const images = post.image
        ? [post.image]
        : shareImages(resolved.snapshot.site);

    return shareable(resolved, {
        // "‹Post› · ‹Business›" in the tab and in search; the share card
        // keeps the post's own title, with the site's name beside it.
        title: titled(post.title, name),
        description,
        openGraph: {
            title: post.title,
            description,
            images,
            url: `/${slug}/${postSlug}`,
            siteName: name,
            type: "article",
            publishedTime: post.publishedAt,
        },
        twitter: {
            card: images ? "summary_large_image" : "summary",
            title: post.title,
            description,
            images,
        },
        ...canonical(resolved, domain, `/${slug}/${postSlug}`),
    });
}

export default async function PostPage({
    params,
    searchParams,
}: {
    params: Promise<{ domain: string; slug: string; postSlug: string }>;
    /** Absent when another route draws this one (`/shop` as a page or the posts). */
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { domain, slug, postSlug } = await params;
    const resolved = await getSiteForPage(domain);
    if (!resolved?.siteId) notFound();

    // The prefix is the whole reason this route exists; a different first
    // segment is not a post address, but may be an old page link that
    // forwards (KTD-3). A post's own address never does (batch 3).
    if (slug !== postsPrefix(resolved.snapshot)) {
        const to = findRedirect(resolved.snapshot, `/${slug}/${postSlug}`);
        if (to) permanentRedirect(withQuery(to, (await searchParams) ?? {}));
        notFound();
    }

    const [post, posts] = await Promise.all([
        getPublishedPost(resolved.siteId, postSlug),
        // Older and Newer (U8). A failed list read draws neither, and the
        // read keeps the page out of the cache.
        readPublishedPosts(resolved.siteId),
    ]);
    if (!post) notFound();

    return (
        <>
            <PostArticle post={post} />
            <PostNeighbours
                {...postNeighbours(posts ?? [], post.slug)}
                basePath={`/${slug}`}
            />
        </>
    );
}
