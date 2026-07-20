import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { PostForm } from "@/components/stores/post-form";
import { getPost, listPostCategories } from "@/lib/content/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

export default async function EditPostPage({
    params,
}: {
    params: Promise<{ storeId: string; postId: string }>;
}) {
    const { storeId, postId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const [post, categories] = await Promise.all([
        getPost(storeId, postId),
        listPostCategories(storeId),
    ]);
    if (!post) notFound();

    return (
        <div className="space-y-6">
            <PageHeader title={post.title} description="Edit this post." />
            <PostForm storeId={storeId} categories={categories} post={post} />
        </div>
    );
}
