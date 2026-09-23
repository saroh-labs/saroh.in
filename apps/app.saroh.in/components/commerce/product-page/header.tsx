import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import { Pencil } from "lucide-react";
import Link from "next/link";

import { sellCrumbs } from "@/components/commerce/sell-crumbs";
import { formatMoneyMajor } from "@/lib/format/money";
import { productEditHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { plural, priceLabel } from "@/lib/products/overview-rules";

export const STATUS_BADGE = {
    PUBLISHED: { label: "Published", variant: "success" },
    DRAFT: { label: "Draft", variant: "draft" },
    ARCHIVED: { label: "Archived", variant: "neutral" },
} as const;

/**
 * Who this product is at a glance: its cover, name and saved status, then
 * one line — what it sells for, how many can be sold, where it sits and
 * where it is sold. "Edit product" opens the whole editor; each panel below
 * links to its own section.
 */
export function ProductHeader({
    overview,
    storeId,
}: {
    overview: ProductOverview;
    storeId: string;
}) {
    const { product, stock, price, storefront } = overview;
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency) ?? amount;
    const status = STATUS_BADGE[product.status];
    const cover = product.images.at(0);
    const tracked = stock.mode === "variant" || stock.product !== null;

    const meta = [
        priceLabel(price, money),
        tracked ? `${stock.totals.canSell} can be sold` : "no stock count",
        product.category?.name ?? "no category",
        product.status === "PUBLISHED"
            ? storefront.name
            : "not on the shop yet",
    ];

    return (
        <div className="flex flex-wrap items-start gap-4">
            <div className="size-14 shrink-0 overflow-hidden rounded-[10px] border border-border bg-muted">
                {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos, outside next/image's allowlist
                    <img
                        src={cover.url}
                        alt=""
                        className="size-full object-cover"
                    />
                ) : (
                    <div
                        aria-hidden
                        className="size-full border-[1.5px] border-dashed border-border-strong"
                    />
                )}
            </div>
            <PageHeader
                className="mb-0 min-w-0 flex-1 basis-64"
                breadcrumb={sellCrumbs(
                    { label: "Products", href: "/commerce/products" },
                    product.name,
                )}
                title={
                    // PageHeader truncates a title; a product's name wraps
                    // instead — "Linen Wrap Dress with Pock…" is a different
                    // product to a merchant.
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-normal">
                        <span className="min-w-0 break-words">
                            {product.name}
                        </span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                    </span>
                }
                description={
                    <span className="tabular-nums">
                        {meta.join(" · ")}
                        {product.variants.length > 0
                            ? ` · ${plural(product.variants.length, "variant")}`
                            : ""}
                    </span>
                }
                actions={
                    overview.canWrite ? (
                        <Button asChild>
                            <Link href={productEditHref(storeId, product.id)}>
                                <Pencil aria-hidden />
                                Edit product
                            </Link>
                        </Button>
                    ) : null
                }
            />
        </div>
    );
}
