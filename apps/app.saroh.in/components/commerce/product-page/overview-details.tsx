import { Card } from "@saroh/ui/card";

import { fulfilmentLine } from "@/lib/products/fulfilment-types";
import type { ProductOverview } from "@/lib/products/overview-rules";
import { customFieldText, onTheShop } from "@/lib/products/overview-rules";
import {
    detailTag,
    NOT_FILLED_IN,
    visibilityLine,
} from "@/lib/products/overview-words";
import { untrackedDetail } from "@/lib/products/tracking";

import { CardHead, DetailRow } from "./overview-parts";
import { SheetButton } from "./sheet-button";

/**
 * Details (#522), in two groups as the design has them: "How it's sold" —
 * visibility (as far as it truly reaches), where, how it's fulfilled
 * (B12), its category, its path
 * and whether stock is counted — and "On the product page", each with a tag saying whether
 * customers see it. One the shop would show but that is empty reads "Not
 * filled in · Hidden until filled in".
 */
export function ProductDetailsCard({
    overview,
    storeId,
    categories,
    stock,
    shopLive = null,
}: {
    overview: ProductOverview;
    storeId: string;
    categories: { id: string; name: string }[];
    /** The online shop is live; null when that couldn't be read. */
    shopLive?: boolean | null;
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
                        {visibilityLine(product.status, shopLive)}
                    </DetailRow>
                    <DetailRow label="Sold at" muted={places.length === 0}>
                        {places.length ? places.join(", ") : "Nowhere yet"}
                    </DetailRow>
                    <DetailRow label="Fulfilled by">
                        {fulfilmentLine(product.fulfilmentTypes)}
                    </DetailRow>
                    <DetailRow label="Category">
                        {product.category?.name ?? "No category"}
                    </DetailRow>
                    <DetailRow label="Path" mono>
                        /products/
                        {product.slug.split("-").map((part, i) => (
                            <span key={i}>
                                {i > 0 ? (
                                    <>
                                        -<wbr />
                                    </>
                                ) : null}
                                {part}
                            </span>
                        ))}
                    </DetailRow>
                    {stock ? (
                        <DetailRow label="Stock">
                            {stock === "untracked"
                                ? untrackedDetail(product.storefronts ?? [])
                                : stock === "tracked-per-storefront"
                                  ? "Tracked · counted per location"
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
                            shopLive,
                        )}
                    >
                        {product.howToUse ?? NOT_FILLED_IN}
                    </DetailRow>
                    <DetailRow
                        label="Made by"
                        muted={!maker}
                        tag={detailTag(
                            Boolean(maker),
                            shown("maker"),
                            shopLive,
                        )}
                    >
                        {maker || NOT_FILLED_IN}
                    </DetailRow>
                    <DetailRow
                        label="Warranty"
                        muted={!product.warranty}
                        tag={detailTag(
                            Boolean(product.warranty),
                            shown("warranty"),
                            shopLive,
                        )}
                    >
                        {product.warranty ?? NOT_FILLED_IN}
                    </DetailRow>
                    <DetailRow
                        label="Returns"
                        tag={detailTag(true, shown("returns"), shopLive)}
                    >
                        {product.returnsMode === "OWN" && product.returnsText
                            ? product.returnsText
                            : "The location's rule"}
                    </DetailRow>
                    {product.customFields.map((f) => (
                        <DetailRow
                            key={f.id}
                            label={f.name}
                            muted={f.value === null}
                            tag={detailTag(
                                f.value !== null,
                                f.onShop,
                                shopLive,
                            )}
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
            <h3 className="label pb-1.5 pt-2.5">{label}</h3>
            <dl>{children}</dl>
        </section>
    );
}
