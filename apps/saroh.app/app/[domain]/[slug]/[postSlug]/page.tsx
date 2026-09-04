import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PostArticle } from "@/components/post-view";
import {
    getPublishedPost,
    getSiteForHost,
    postsPrefix,
    shareImages,
} from "@/lib/publication";

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

    return {
        title: post.title,
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
        metadataBase: new URL(`https://${domain}`),
    };
}

export default async function PostPage({
    params,
}: {
    params: Promise<{ domain: string; slug: string; postSlug: string }>;
}) {
    const { domain, slug, postSlug } = await params;
    const resolved = await getSiteForHost(domain);
    if (!resolved?.siteId) notFound();

    // The prefix is the whole reason this route exists; a different first
    // segment is not a post address.
    if (slug !== postsPrefix(resolved.snapshot)) notFound();

    const post = await getPublishedPost(resolved.siteId, postSlug);
    if (!post) notFound();

    return <PostArticle post={post} />;
}
