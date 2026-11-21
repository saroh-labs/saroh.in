import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { PostShell } from "@/components/sites/posts/editor/post-shell";
import { getPost } from "@/lib/content/service";
import { recordTitle } from "@/lib/page-title";
import { requireSession } from "@/lib/session";
import { readPostEditorData } from "@/lib/sites/post-editor-read";
import { getSite } from "@/lib/sites/service";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";

// One read for the tab's title and the page.
const readPost = cache((siteId: string, postId: string) =>
    getPost(siteId, postId),
);

/** The tab's title (UX-081): the post's own title, then "Website". */
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

/**
 * A post in the desk editor (U15, KTD-E7): its own address in the editor
 * group, full screen. Changing a post is `section:write`, which the site
 * read answers as `can.edit`; a Reviewer or a Member gets the same editor
 * read only (DEC-200 U8), and the API refuses any write regardless.
 */
export default async function WritePostPage({
    params,
}: {
    params: Promise<{ siteId: string; postId: string }>;
}) {
    const { siteId, postId } = await params;
    // Off, today's post editor, as every link into it is (owner, 20 Nov).
    if (!(await websiteAreaOn())) redirect(`/sites/${siteId}/posts/${postId}`);
    await requireSession();
    const site = await getSite(siteId);
    if (!site) notFound();
    const post = await readPost(siteId, postId);
    if (!post) notFound();
    const data = await readPostEditorData(site, post);
    // Keyed by post: moving to another post starts its own draft.
    return <PostShell key={post.id} data={data} post={post} />;
}
