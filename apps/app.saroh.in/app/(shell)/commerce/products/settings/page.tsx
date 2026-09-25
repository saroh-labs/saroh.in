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
import { StorefrontChooser } from "@/components/commerce/storefront-chooser";
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
import { listBusinessStores } from "@/lib/stores/service";

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
 * Sell → Products → Settings (#470): one storefront's categories, the
 * options its variants choose by, and what a new product starts with.
 */
export default async function ProductSettingsPage({
    searchParams,
}: {
    searchParams: Promise<{ storefront?: string; tab?: string }>;
}) {
    await requireSession();
    const [{ storefront, tab: rawTab }, stores] = await Promise.all([
        searchParams,
        listBusinessStores(),
    ]);
    const store =
        stores.find((s) => s.id === storefront) ??
        (stores.length === 1 ? stores[0] : undefined);

    if (!store) {
        return (
            <PageContainer width="form">
                <StorefrontChooser
                    section="Products"
                    sectionHref="/commerce/products"
                    crumb="Settings"
                    title="Whose settings?"
                    description="Each storefront keeps its own categories, options and defaults."
                    stores={stores}
                    hrefFor={(id) => productSettingsHref(id)}
                />
            </PageContainer>
        );
    }

    const tab: SettingsTab =
        isSettingsTab(rawTab) && BUILT.includes(rawTab) ? rawTab : "categories";
    const [catalogue, fields, allergens] = await Promise.all([
        getCatalogue(store.id).catch(() => null),
        listFields(store.id).catch(() => null),
        listAllergens(store.id).catch(() => null),
    ]);
    const sku =
        tab === "sku" ? await getSkuSettings(store.id).catch(() => null) : null;
    const skuPreview = sku
        ? await getSkuPreview(store.id, sku.pattern).catch(() => null)
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
                description={stores.length > 1 ? store.name : undefined}
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
                    storeId={store.id}
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
                        <CategoriesTab
                            storeId={store.id}
                            catalogue={catalogue}
                        />
                    ) : tab === "options" ? (
                        <OptionsTab storeId={store.id} catalogue={catalogue} />
                    ) : tab === "fields" ? (
                        <FieldsTab
                            storeId={store.id}
                            catalogue={catalogue}
                            fields={fields ?? []}
                        />
                    ) : tab === "allergens" ? (
                        <AllergensTab
                            storeId={store.id}
                            allergens={allergens ?? []}
                            canWrite={catalogue.canWrite}
                        />
                    ) : tab === "sku" ? (
                        <SkuTab
                            storeId={store.id}
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
                        <DefaultsTab storeId={store.id} catalogue={catalogue} />
                    )}
                </ProductSettings>
            ) : (
                <FailedState
                    title="Couldn't load product settings"
                    description="Nothing has been changed. Try again in a moment."
                    action={
                        <Button asChild variant="outline">
                            <Link href={productSettingsHref(store.id, tab)}>
                                Try again
                            </Link>
                        </Button>
                    }
                />
            )}
        </PageContainer>
    );
}
