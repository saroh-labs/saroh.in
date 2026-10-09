import { notFound } from "next/navigation";

import { PostEditor } from "@/components/sites/post-editor";
import { activeCut, postPaused } from "@/lib/billing/paused";
import { getPost, listPostCategories } from "@/lib/content/service";
import { pausedOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { getSite } from "@/lib/sites/service";

/** The tab's title (UX-081): without one it read the bare "Saroh". */
export const metadata = { title: "Post · Website" };

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

    const [post, categories, paused] = await Promise.all([
        getPost(siteId, postId),
        listPostCategories(siteId),
        // Past the plan's blog posts limit (#800): read-only, and why.
        pausedOrNull(),
    ]);
    if (!post) notFound();

    return (
        <PostEditor
            siteId={siteId}
            categories={categories}
            post={post}
            paused={postPaused(post, activeCut(paused, "posts"))}
        />
    );
}
