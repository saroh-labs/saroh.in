import { Card } from "@saroh/ui/card";

import type { ProductOverview } from "@/lib/products/overview-rules";
import { customFieldText, onTheShop } from "@/lib/products/overview-rules";
import { detailTag, NOT_FILLED_IN } from "@/lib/products/overview-words";

import { CardHead, DetailRow } from "./overview-parts";
import { SheetButton } from "./sheet-button";

/**
 * Details (#522), in two groups as the design has them: "How it's sold" —
 * visibility, where, its category, its address and whether stock is
 * counted — and "On the product page", each with a tag saying whether
 * customers see it. One the shop would show but that is empty reads "Not
 * filled in · Hidden until filled in".
 */
export function ProductDetailsCard({
    overview,
    storeId,
    categories,
    stock,
}: {
    overview: ProductOverview;
    storeId: string;
    categories: { id: string; name: string }[];
    /** How stock is counted, or null when the business doesn't track it. */
    stock: "tracked" | "tracked-per-storefront" | "untracked" | null;
}) {
    const { product } = overview;
    const places = (product.storefronts ?? []).map((s) => s.name);
    const shown = (key: keyof typeof product.shopFields) =>
        onTheShop(product.shopFields, key);
    const maker = product.madeHere
        ? `${overview.storefront.name}, made here`
        : [product.maker, product.madeIn].filter(Boolean).join(", ");

    return (
        <Card className="min-w-0 rounded-[12px] p-0">
            <CardHead title="Details">
                {overview.canWrite ? (
                    <SheetButton
                        kind="details"
                        label="Edit"
                        ariaLabel="Edit details"
                        product={product}
                        storeId={storeId}
                        categories={categories}
                    />
                ) : null}
            </CardHead>
            <div className="px-[18px] pb-1.5">
                <Group label="How it's sold">
                    <DetailRow label="Visibility">
                        {product.status === "PUBLISHED"
                            ? "On the shop — customers can buy it"
                            : product.status === "DRAFT"
                              ? "Draft — only the team can see it"
                              : "Archived — not sold, its page does not open"}
                    </DetailRow>
                    <DetailRow label="Sold at" muted={places.length === 0}>
                        {places.length ? places.join(", ") : "Nowhere yet"}
                    </DetailRow>
                    <DetailRow label="Category">
                        {product.category?.name ?? "Uncategorized"}
                    </DetailRow>
                    <DetailRow label="Address" mono>
                        /products/{product.slug}
                    </DetailRow>
                    {stock ? (
                        <DetailRow label="Stock">
                            {stock === "untracked"
                                ? "Not tracked · always available"
                                : stock === "tracked-per-storefront"
                                  ? "Tracked · counted per storefront"
                                  : "Tracked"}
                        </DetailRow>
                    ) : null}
                </Group>
                <Group label="On the product page">
                    <DetailRow
                        label="How to use"
                        muted={!product.howToUse}
                        tag={detailTag(
                            Boolean(product.howToUse),
                            shown("howToUse"),
                        )}
                    >
                        {product.howToUse ?? NOT_FILLED_IN}
                    </DetailRow>
                    <DetailRow
                        label="Made by"
                        muted={!maker}
                        tag={detailTag(Boolean(maker), shown("maker"))}
                    >
                        {maker || NOT_FILLED_IN}
                    </DetailRow>
                    <DetailRow
                        label="Warranty"
                        muted={!product.warranty}
                        tag={detailTag(
                            Boolean(product.warranty),
                            shown("warranty"),
                        )}
                    >
                        {product.warranty ?? NOT_FILLED_IN}
                    </DetailRow>
                    <DetailRow
                        label="Returns"
                        tag={detailTag(true, shown("returns"))}
                    >
                        {product.returnsMode === "OWN" && product.returnsText
                            ? product.returnsText
                            : "The storefront's rule"}
                    </DetailRow>
                    {product.customFields.map((f) => (
                        <DetailRow
                            key={f.id}
                            label={f.name}
                            muted={f.value === null}
                            tag={detailTag(f.value !== null, f.onShop)}
                        >
                            {f.value === null
                                ? NOT_FILLED_IN
                                : customFieldText(f)}
                        </DetailRow>
                    ))}
                </Group>
            </div>
        </Card>
    );
}

function Group({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <section aria-label={label}>
            <h3 className="pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {label}
            </h3>
            <dl>{children}</dl>
        </section>
    );
}
