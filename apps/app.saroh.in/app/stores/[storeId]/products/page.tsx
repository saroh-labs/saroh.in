import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { listProducts } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
    PUBLISHED: "default",
    DRAFT: "secondary",
    ARCHIVED: "outline",
};

/** Display a decimal-string price with 2 places (display only; value is exact). */
function formatPrice(price: string): string {
    const n = Number(price);
    return Number.isFinite(n) ? n.toFixed(2) : price;
}

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
                <ul className="divide-y rounded-lg border">
                    {products.map((p) => (
                        <li key={p.id}>
                            <Link
                                href={`${base}/${p.id}`}
                                className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                        {p.name}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {p.category?.name ?? "Uncategorized"}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm tabular-nums">
                                        {p.currency} {formatPrice(p.price)}
                                    </span>
                                    <Badge
                                        variant={
                                            STATUS_VARIANT[p.status] ??
                                            "secondary"
                                        }
                                    >
                                        {p.status}
                                    </Badge>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
