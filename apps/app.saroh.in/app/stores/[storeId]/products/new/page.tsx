import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/stores/product-form";
import { listCategories } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

export default async function NewProductPage({
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
            <h2 className="text-lg font-medium">New product</h2>
            <ProductForm storeId={storeId} categories={categories} />
        </div>
    );
}
