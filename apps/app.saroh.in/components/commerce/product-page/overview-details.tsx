import { Badge } from "@saroh/ui/badge";
import { Card } from "@saroh/ui/card";
import type { ReactNode } from "react";

import { formatMoneyMajor } from "@/lib/format/money";
import type { EditorSection } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview-rules";
import { onTheShop } from "@/lib/products/overview-rules";

import { EditLink, SectionTitle } from "./overview-parts";

/**
 * "Everything about it": each fact about the product, and — for the ones a
 * customer could see — a tag saying whether they do.
 */
export function ProductDetailsCard({
    overview,
    edit,
}: {
    overview: ProductOverview;
    edit: (section?: EditorSection) => string;
}) {
    const { product } = overview;
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency) ?? amount;
    return (
        <section className="flex min-w-0 flex-col gap-3">
            <SectionTitle
                title="Everything about it"
                aside="Tags say what customers see."
                action={
                    overview.canWrite ? (
                        <EditLink href={edit("details")} label="Edit details" />
                    ) : null
                }
            />
            <Card className="px-4 py-1">
                <dl className="divide-y divide-border text-[13.5px]">
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
                    <Row label="Price">
                        <span className="tabular-nums">
                            {money(product.price)}
                            {product.mrp ? (
                                <span className="text-muted-foreground">
                                    {" "}
                                    · MRP {money(product.mrp)}
                                    {overview.price.savingPercent
                                        ? ` (${overview.price.savingPercent}% off)`
                                        : ""}
                                </span>
                            ) : null}
                        </span>
                    </Row>
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
                        label="Ingredients or material"
                        shown={
                            product.materials
                                ? onTheShop(product.shopFields, "materials")
                                : null
                        }
                    >
                        {product.materials ?? <Muted>Not given.</Muted>}
                    </Row>
                    <Row
                        label="Made by"
                        shown={onTheShop(product.shopFields, "maker")}
                    >
                        {product.madeHere
                            ? "Made here"
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
        <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-start gap-3 py-2.5 max-sm:grid-cols-1 max-sm:gap-1">
            <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
            <dd className="flex min-w-0 flex-wrap items-start justify-between gap-2 break-words">
                <span className="min-w-0">{children}</span>
                {shown === true ? (
                    <Badge variant="success">On the shop</Badge>
                ) : null}
                {shown === false ? (
                    <Badge variant="neutral">Team only</Badge>
                ) : null}
            </dd>
        </div>
    );
}

function Muted({ children }: { children: ReactNode }) {
    return <span className="text-muted-foreground">{children}</span>;
}
