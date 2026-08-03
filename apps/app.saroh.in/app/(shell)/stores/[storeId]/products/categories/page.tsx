import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { CategoriesManager } from "@/components/stores/categories-manager";
import { listCategories } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

export default async function CategoriesPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const categories = await listCategories(storeId);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Categories"
                description="Organize your catalog. Categories can be nested."
            />
            <CategoriesManager storeId={storeId} categories={categories} />
        </div>
    );
}
