import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/stores/product-form";
import { ProductVariants } from "@/components/stores/product-variants";
import { getProduct, listCategories } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

export default async function EditProductPage({
    params,
}: {
    params: Promise<{ storeId: string; productId: string }>;
}) {
    const { storeId, productId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const [product, categories] = await Promise.all([
        getProduct(storeId, productId),
        listCategories(storeId),
    ]);
    if (!product) notFound();

    return (
        <div className="space-y-8">
            <div className="space-y-6">
                <PageHeader
                    title={product.name}
                    description="Edit product details, pricing, and stock."
                />
                <ProductForm
                    storeId={storeId}
                    categories={categories}
                    product={product}
                />
            </div>

            <ProductVariants
                storeId={storeId}
                productId={productId}
                variants={product.variants}
                inventory={product.inventory}
            />
        </div>
    );
}
