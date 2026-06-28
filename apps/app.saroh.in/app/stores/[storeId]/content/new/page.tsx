import Link from "next/link";
import { notFound } from "next/navigation";

import { PostForm } from "@/components/stores/post-form";
import { listPostCategories } from "@/lib/content/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

export default async function NewPostPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const categories = await listPostCategories(storeId);

    return (
        <div className="space-y-6">
            <Link
                href={`/stores/${storeId}/content`}
                className="text-sm text-muted-foreground hover:underline"
            >
                ← Back to content
            </Link>
            <h2 className="text-lg font-medium">New post</h2>
            <PostForm storeId={storeId} categories={categories} />
        </div>
    );
}
