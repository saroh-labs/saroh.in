import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import {
    PostArticle,
    PostNeighbours,
    postNeighbours,
} from "@/components/post-view";
import { postMovedTo } from "@/lib/post-moved";
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
    // Its own Google title and text (U17a), else the title and the short
    // description. Blank is "not written".
    const own = (text: string | null | undefined) =>
        text?.trim() ? text.trim() : undefined;
    const description = own(post.seoDescription) ?? own(post.excerpt);
    // Its own share image, else its cover, else the site's, so a post is
    // never shared with no card at all.
    const image = own(post.shareImageUrl) ?? own(post.image);
    const images = image ? [image] : shareImages(resolved.snapshot.site);

    return shareable(resolved, {
        // "‹Post› · ‹Business›" in the tab and in search; the share card
        // keeps the post's own title, with the site's name beside it.
        title: titled(own(post.seoTitle) ?? post.title, name),
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
    // forwards (KTD-3). An old post link forwards below (U17a).
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
    if (!post) {
        // A link the post was live at before its link changed (U17a).
        const to = await postMovedTo(resolved.siteId, postSlug);
        if (to) {
            permanentRedirect(
                withQuery(`/${slug}/${to}`, (await searchParams) ?? {}),
            );
        }
        notFound();
    }

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
