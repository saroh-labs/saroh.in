import { PageHeader } from "@saroh/ui/page-header";
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
            <PageHeader
                title="New product"
                description="Add a product to your catalog."
            />
            <ProductForm storeId={storeId} categories={categories} />
        </div>
    );
}
