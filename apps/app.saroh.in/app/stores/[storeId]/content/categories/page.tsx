import Link from "next/link";
import { notFound } from "next/navigation";

import { PostCategoriesManager } from "@/components/stores/post-categories-manager";
import { listPostCategories } from "@/lib/content/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

export default async function PostCategoriesPage({
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
            <div>
                <h2 className="text-lg font-medium">Post categories</h2>
                <p className="text-sm text-muted-foreground">
                    Organize posts into categories for your storefront blog.
                </p>
            </div>
            <PostCategoriesManager storeId={storeId} categories={categories} />
        </div>
    );
}
