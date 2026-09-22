import { EmptyState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { ChevronRight, Package } from "lucide-react";
import Link from "next/link";

import { ProductEditor } from "@/components/commerce/product-editor";
import { PageContainer } from "@/components/shared/page-container";
import { loadEditorContext } from "@/lib/products/editor-data";
import { newProductHref } from "@/lib/products/links";
import { requireSession } from "@/lib/session";
import { listStores } from "@/lib/stores/service";

export const metadata = { title: "New product" };

/**
 * Sell → Products → New product.
 *
 * A product is made at one storefront — that is where the API keeps it — so
 * with more than one, the first question is which. It is asked here as a
 * short list rather than a field on the form, because the answer decides the
 * currency and the categories the form offers.
 */
export default async function NewProductPage({
    searchParams,
}: {
    searchParams: Promise<{ storefront?: string }>;
}) {
    await requireSession();
    const [{ storefront }, stores] = await Promise.all([
        searchParams,
        listStores(),
    ]);
    const store =
        stores.find((s) => s.id === storefront) ??
        (stores.length === 1 ? stores[0] : undefined);

    if (store) {
        const context = await loadEditorContext(store);
        return (
            <PageContainer width="full">
                <ProductEditor {...context} />
            </PageContainer>
        );
    }

    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={[
                    "Sell",
                    <Link
                        key="products"
                        href="/commerce/products"
                        className="hover:text-foreground"
                    >
                        Products
                    </Link>,
                    "New product",
                ]}
                title="Where is it sold?"
                description="A product is made at one storefront, and priced in that storefront's currency."
            />
            {stores.length === 0 ? (
                <EmptyState
                    icon={<Package />}
                    title="No storefront yet"
                    description="Products are sold at a storefront, so the first one comes before the first product."
                    action={
                        <Link
                            href="/stores/new"
                            className="font-medium underline-offset-4 hover:underline"
                        >
                            Make a storefront
                        </Link>
                    }
                />
            ) : (
                <ul className="overflow-hidden rounded-[12px] border border-border">
                    {stores.map((s) => (
                        <li
                            key={s.id}
                            className="border-b border-border last:border-b-0"
                        >
                            <Link
                                href={newProductHref(s.id)}
                                className="flex items-center gap-3 bg-card px-[18px] py-[14px] transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-medium">
                                        {s.name}
                                    </span>
                                    <span className="block font-mono text-[11.5px] text-muted-foreground">
                                        /{s.slug}
                                    </span>
                                </span>
                                <ChevronRight
                                    aria-hidden
                                    className="size-4 text-muted-foreground"
                                />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </PageContainer>
    );
}
