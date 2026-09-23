import { Badge } from "@saroh/ui/badge";
import { Card } from "@saroh/ui/card";
import type { ReactNode } from "react";

import type { ProductOverview } from "@/lib/products/overview-rules";
import {
    allergenLine,
    customFieldText,
    onTheShop,
} from "@/lib/products/overview-rules";

import { SectionTitle } from "./overview-parts";
import { SheetButton } from "./sheet-button";

/**
 * "Everything about it": each fact about the product, and — for the ones a
 * customer could see — a tag saying whether they do.
 */
export function ProductDetailsCard({
    overview,
    storeId,
    categories,
}: {
    overview: ProductOverview;
    storeId: string;
    categories: { id: string; name: string }[];
}) {
    const { product } = overview;
    return (
        <section className="flex min-w-0 flex-col gap-3">
            <SectionTitle
                title="Everything about it"
                aside="Tags say what customers see. You choose in the editor."
                action={
                    overview.canWrite ? (
                        <SheetButton
                            kind="details"
                            label="Edit"
                            ariaLabel="Edit details"
                            product={product}
                            storeId={storeId}
                            categories={categories}
                        />
                    ) : null
                }
            />
            <Card className="rounded-[12px] px-[18px] py-1">
                <dl className="divide-y divide-foreground/10 text-[13.5px]">
                    <Row label="Visibility">
                        {product.status === "PUBLISHED"
                            ? "On the shop — customers can buy it"
                            : product.status === "DRAFT"
                              ? "Draft — only the team can see it"
                              : "Archived — not sold, and its page does not open"}
                    </Row>
                    <Row label="Category">
                        {product.category?.name ?? "Uncategorized"}
                    </Row>
                    <Row label="Sold at">{overview.storefront.name}</Row>
                    <Row
                        label="How to use"
                        shown={
                            product.howToUse
                                ? onTheShop(product.shopFields, "howToUse")
                                : null
                        }
                    >
                        {product.howToUse ?? <Muted>Not set.</Muted>}
                    </Row>
                    <Row
                        label="Made by"
                        shown={onTheShop(product.shopFields, "maker")}
                    >
                        {product.madeHere
                            ? `${overview.storefront.name}, made here`
                            : [product.maker, product.madeIn]
                                  .filter(Boolean)
                                  .join(", ")}
                    </Row>
                    <Row
                        label="Warranty"
                        shown={
                            product.warranty
                                ? onTheShop(product.shopFields, "warranty")
                                : null
                        }
                    >
                        {product.warranty ?? <Muted>None.</Muted>}
                    </Row>
                    <Row
                        label="Returns"
                        shown={onTheShop(product.shopFields, "returns")}
                    >
                        {product.returnsMode === "OWN"
                            ? product.returnsText
                            : "The storefront's rule"}
                    </Row>
                    {allergenLine(product.allergens) ? (
                        <Row label="Allergens" shown>
                            {allergenLine(product.allergens)}
                        </Row>
                    ) : null}
                    {product.customFields.map((f) => (
                        <Row
                            key={f.id}
                            label={f.name}
                            shown={f.value === null ? null : f.onShop}
                        >
                            {f.value === null ? (
                                <Muted>Not set.</Muted>
                            ) : (
                                customFieldText(f)
                            )}
                        </Row>
                    ))}
                    <Row label="Address">
                        <span className="break-all font-mono text-[12px]">
                            /products/{product.slug}
                        </span>
                    </Row>
                </dl>
            </Card>
        </section>
    );
}

function Row({
    label,
    shown,
    children,
}: {
    label: string;
    /** true/false draws the On the shop / Team only tag; null draws none. */
    shown?: boolean | null;
    children: ReactNode;
}) {
    return (
        <div className="grid grid-cols-[104px_minmax(0,1fr)] items-baseline gap-3 py-[11px] max-sm:grid-cols-1 max-sm:gap-1">
            <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
            <dd className="flex min-w-0 flex-wrap items-start justify-between gap-2 break-words">
                <span className="min-w-0">{children}</span>
                {shown === true ? (
                    <Badge
                        variant="success"
                        className="rounded-full px-[7px] py-px text-[11px] font-semibold"
                    >
                        On the shop
                    </Badge>
                ) : null}
                {shown === false ? (
                    <Badge
                        variant="neutral"
                        className="rounded-full px-[7px] py-px text-[11px] font-semibold"
                    >
                        Team only
                    </Badge>
                ) : null}
            </dd>
        </div>
    );
}

function Muted({ children }: { children: ReactNode }) {
    return <span className="text-muted-foreground">{children}</span>;
}
