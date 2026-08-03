import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductsTable } from "@/components/stores/products-table";
import { listProducts } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

/**
 * Products catalog list. Store-access gated (members can read). Each row links
 * to the product editor; the "New product" action is shown to everyone with
 * access — the api rejects writes from VIEWER members.
 */
export default async function ProductsPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const products = await listProducts(storeId);
    const base = `/stores/${storeId}/products`;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Products"
                description="Your catalog — products, pricing, and stock."
                actions={
                    <>
                        <Button variant="outline" asChild>
                            <Link href={`${base}/categories`}>Categories</Link>
                        </Button>
                        <Button variant="brand" asChild>
                            <Link href={`${base}/new`}>New product</Link>
                        </Button>
                    </>
                }
            />

            {products.length === 0 ? (
                <EmptyState
                    title="No products yet"
                    description="Add your first product to start building the catalog."
                    action={
                        <Button variant="brand" asChild>
                            <Link href={`${base}/new`}>New product</Link>
                        </Button>
                    }
                />
            ) : (
                <ProductsTable products={products} base={base} />
            )}
        </div>
    );
}
