import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductsTable } from "@/components/stores/products-table";
import { listProducts } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";
import { viewParam } from "@/lib/views/search-params";

/**
 * Products catalog list. Store-access gated (members can read). Each row links
 * to the product editor; the "New product" action is shown to everyone with
 * access — the api rejects writes from VIEWER members.
 *
 * `ProductsTable` owns the empty state along with every other density concern,
 * so the local `EmptyState` branch is gone: two components each answering
 * "there is nothing here" is how the two answers drift apart.
 */
export default async function ProductsPage({
    params,
    searchParams,
}: {
    params: Promise<{ storeId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { storeId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const [products, query] = await Promise.all([
        listProducts(storeId),
        searchParams,
    ]);
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

            <ProductsTable
                products={products}
                base={base}
                initialView={viewParam(query)}
            />
        </div>
    );
}
