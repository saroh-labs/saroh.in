import { notFound } from "next/navigation";
import { cache } from "react";

import { PostEditor } from "@/components/sites/posts/post-editor";
import { activeCut, postPaused } from "@/lib/billing/paused";
import { getPost, listPostCategories } from "@/lib/content/service";
import { recordTitle } from "@/lib/page-title";
import { pausedOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { getSite, listComments } from "@/lib/sites/service";

// One read for the tab's title and the page.
const readPost = cache((siteId: string, postId: string) =>
    getPost(siteId, postId),
);

/**
 * The tab's title (UX-081): the post's own title, then "Website"; "Post"
 * when it can't be read or has none yet.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ siteId: string; postId: string }>;
}) {
    const { siteId, postId } = await params;
    return recordTitle(
        () => readPost(siteId, postId),
        (post) => post.title,
        "Post",
        "Website",
    );
}

/*
 * The editor is document-shaped and owns the whole area (#232) — it carries
 * its own header with the state and the publish control, so a PageHeader above
 * it would be a second, quieter title saying the same thing.
 */
export default async function EditPostPage({
    params,
}: {
    params: Promise<{ siteId: string; postId: string }>;
}) {
    const { siteId, postId } = await params;
    await requireSession();
    const site = await getSite(siteId);
    if (!site) notFound();

    const [post, categories, paused, comments] = await Promise.all([
        readPost(siteId, postId),
        listPostCategories(siteId),
        // Past the plan's blog posts limit (#800): read-only, and why.
        pausedOrNull(),
        // Notes on this post (DEC-200 U8), for its Feedback panel. A reader
        // is here for them, so a failure is the segment's to explain; the
        // writer can still write without them.
        site.can.edit
            ? listComments(siteId).catch(() => null)
            : listComments(siteId),
    ]);
    if (!post) notFound();

    /*
     * Changing a post is `section:write` (`posts.service.ts`), which the
     * site read answers as `can.edit`. A Reviewer or a Member gets the same
     * editor read-only (DEC-200 U8): every field shown, none changeable, no
     * Save or Publish. The api still refuses any write.
     */
    return (
        <PostEditor
            siteId={siteId}
            categories={categories}
            post={post}
            paused={postPaused(post, activeCut(paused, "posts"))}
            readOnly={!site.can.edit}
            feedback={
                comments
                    ? {
                          comments: comments.filter(
                              (c) => c.postId === post.id,
                          ),
                          canComment: site.can.comment,
                          canSettle: site.can.edit,
                      }
                    : undefined
            }
        />
    );
}
