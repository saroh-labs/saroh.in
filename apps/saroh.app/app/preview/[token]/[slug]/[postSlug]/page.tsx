import { notFound } from "next/navigation";

import { PostArticle } from "@/components/post-view";
import {
    getPreviewByToken,
    getPreviewPost,
    postsPrefix,
} from "@/lib/publication";

/**
 * One post from the draft, behind a preview token (#236).
 *
 * The seam between #198 and #232. A preview served the site's pages and had no
 * route for its writing, so a reviewer handed a link could not read a single
 * post — and posts publish independently of pages, so there was no snapshot
 * that held both.
 *
 * This reads the DRAFT, which is the point: the writing a reviewer is being
 * asked about is usually the writing that has not gone out yet. The post
 * carries the preview's chrome and its link rewriting from the layout above,
 * so a reviewer cannot fall out onto the live site, and the article says in
 * Saroh's own words when what they are reading is not published.
 *
 * Nothing here is reachable from the public routes: those read a post's
 * current publication and nothing else.
 */
export default async function PreviewPostPage({
    params,
}: {
    params: Promise<{ token: string; slug: string; postSlug: string }>;
}) {
    const { token, slug, postSlug } = await params;
    const preview = await getPreviewByToken(token);
    // The layout has already explained an expired or revoked link.
    if (!preview.ok) return null;

    // Only under the merchant's own prefix. Without this a post would answer
    // at every two-segment path in the preview, which the live site does not do.
    if (slug !== postsPrefix(preview.snapshot)) notFound();

    const post = await getPreviewPost(token, postSlug);
    if (!post) notFound();

    return <PostArticle post={post} />;
}
