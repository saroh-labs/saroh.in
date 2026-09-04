import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { PostForm } from "@/components/sites/post-form";
import { getPost, listPostCategories } from "@/lib/content/service";
import { requireSession } from "@/lib/session";
import { getSite } from "@/lib/sites/service";

export default async function EditPostPage({
    params,
}: {
    params: Promise<{ siteId: string; postId: string }>;
}) {
    const { siteId, postId } = await params;
    await requireSession();
    const site = await getSite(siteId);
    if (!site) notFound();

    const [post, categories] = await Promise.all([
        getPost(siteId, postId),
        listPostCategories(siteId),
    ]);
    if (!post) notFound();

    return (
        <div className="space-y-6">
            <PageHeader title={post.title} description="Edit this post." />
            <PostForm siteId={siteId} categories={categories} post={post} />
        </div>
    );
}
