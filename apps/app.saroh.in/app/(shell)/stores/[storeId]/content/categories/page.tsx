import { PageHeader } from "@saroh/ui/page-header";
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
            <PageHeader
                title="Post categories"
                description="Organize posts into categories for your storefront blog."
            />
            <PostCategoriesManager storeId={storeId} categories={categories} />
        </div>
    );
}
