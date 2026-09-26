import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AllergensTab } from "@/components/commerce/product-settings/allergens-tab";
import { CategoriesTab } from "@/components/commerce/product-settings/categories-tab";
import { DefaultsTab } from "@/components/commerce/product-settings/defaults-tab";
import { FieldsTab } from "@/components/commerce/product-settings/fields-tab";
import { OptionsTab } from "@/components/commerce/product-settings/options-tab";
import { ProductSettings } from "@/components/commerce/product-settings/product-settings";
import { SkuTab } from "@/components/commerce/product-settings/sku-tab";
import { sellCrumbs } from "@/components/commerce/sell-crumbs";
import { PageContainer } from "@/components/shared/page-container";
import type { SettingsTab } from "@/lib/products/links";
import { isSettingsTab, productSettingsHref } from "@/lib/products/links";
import {
    getCatalogue,
    getSkuPreview,
    getSkuSettings,
    listAllergens,
    listFields,
} from "@/lib/products/settings";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Product settings" };

/** The six tabs, in the design's order. */
const BUILT: SettingsTab[] = [
    "categories",
    "options",
    "fields",
    "allergens",
    "sku",
    "defaults",
];

/**
 * Sell → Products → Settings (#470): the business's categories, the options
 * variants choose by, and what a new product starts with. One set for the
 * business (#529), whatever storefront sells the product — so no storefront
 * is picked here, and an old `?storefront=` link opens the same page.
 */
export default async function ProductSettingsPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    await requireSession();
    const { tab: rawTab } = await searchParams;

    const tab: SettingsTab =
        isSettingsTab(rawTab) && BUILT.includes(rawTab) ? rawTab : "categories";
    const [catalogue, fields, allergens] = await Promise.all([
        getCatalogue().catch(() => null),
        listFields().catch(() => null),
        listAllergens().catch(() => null),
    ]);
    const sku = tab === "sku" ? await getSkuSettings().catch(() => null) : null;
    const skuPreview = sku
        ? await getSkuPreview(sku.pattern).catch(() => null)
        : null;

    return (
        <PageContainer width="wide" className="space-y-3">
            <PageHeader
                className="mb-0"
                breadcrumb={sellCrumbs(
                    { label: "Products", href: "/commerce/products" },
                    "Settings",
                )}
                title="Product settings"
                actions={
                    <Link
                        href="/commerce/products"
                        className="text-[12.5px] text-brand hover:text-foreground"
                    >
                        Back to products
                    </Link>
                }
            />
            {catalogue ? (
                <ProductSettings
                    tab={tab}
                    tabs={[
                        {
                            key: "categories",
                            count: catalogue.categories.length + 1,
                        },
                        { key: "options", count: catalogue.options.length },
                        { key: "fields", count: fields?.length ?? 0 },
                        { key: "allergens", count: allergens?.length ?? 0 },
                        { key: "sku" },
                        { key: "defaults" },
                    ]}
                >
                    {tab === "categories" ? (
                        <CategoriesTab catalogue={catalogue} />
                    ) : tab === "options" ? (
                        <OptionsTab catalogue={catalogue} />
                    ) : tab === "fields" ? (
                        <FieldsTab
                            catalogue={catalogue}
                            fields={fields ?? []}
                        />
                    ) : tab === "allergens" ? (
                        <AllergensTab
                            allergens={allergens ?? []}
                            canWrite={catalogue.canWrite}
                        />
                    ) : tab === "sku" ? (
                        <SkuTab
                            settings={
                                sku ?? {
                                    pattern: "{NAME3}{N}-{VALUE}",
                                    suggest: true,
                                    n: 1,
                                }
                            }
                            preview={skuPreview}
                            canWrite={catalogue.canWrite}
                        />
                    ) : (
                        <DefaultsTab catalogue={catalogue} />
                    )}
                </ProductSettings>
            ) : (
                <FailedState
                    title="Couldn't load product settings"
                    description="Nothing has been changed. Try again in a moment."
                    action={
                        <Button asChild variant="outline">
                            <Link href={productSettingsHref(tab)}>
                                Try again
                            </Link>
                        </Button>
                    }
                />
            )}
        </PageContainer>
    );
}
