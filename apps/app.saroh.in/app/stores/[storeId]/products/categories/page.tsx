import Link from "next/link";
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
            <Link
                href={`/stores/${storeId}/products`}
                className="text-sm text-muted-foreground hover:underline"
            >
                ← Back to products
            </Link>
            <div>
                <h2 className="text-lg font-medium">Categories</h2>
                <p className="text-sm text-muted-foreground">
                    Organize your catalog. Categories can be nested.
                </p>
            </div>
            <CategoriesManager storeId={storeId} categories={categories} />
        </div>
    );
}
