"use client";

import { FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";

import { PageLoading } from "@/components/shared/page/page-loading";
import type { SettingsTab } from "@/lib/products/links";
import { productSettingsHref } from "@/lib/products/links";
import { useProductSettings } from "@/lib/products/use-product-settings";

import { AllergensTab } from "./allergens-tab";
import { CategoriesTab } from "./categories-tab";
import { DefaultsTab } from "./defaults-tab";
import { FieldsTab } from "./fields-tab";
import { OptionsTab } from "./options-tab";
import { ProductSettings } from "./product-settings";
import { SkuTab } from "./sku-tab";

/** What the SKU tab starts from when the business has no pattern read. */
const SKU_FALLBACK = { pattern: "{NAME3}{N}-{VALUE}", suggest: true, n: 1 };

/**
 * Product settings on React Query (DEC-259): the tabs drawn at once (their
 * counts when the lists land), the tab's body a skeleton until then. One
 * read (`/api/products/settings`), `settings`-tier: kept for the visit and
 * read again by the tabs' own saves (`useProductSettingsSave`). A
 * catalogue that can't be read is the page's failed state, never empty.
 */
export function ProductSettingsContainer({ tab }: { tab: SettingsTab }) {
    const read = useProductSettings(tab === "sku" ? { sku: "1" } : {});
    const data = read.data;
    if (read.isError && !data) {
        return (
            <FailedState
                title={couldntLoad("product settings")}
                retryHref={productSettingsHref(tab)}
            />
        );
    }
    const catalogue = data?.catalogue;
    return (
        <ProductSettings
            tab={tab}
            tabs={[
                {
                    key: "categories",
                    count: catalogue && catalogue.categories.length + 1,
                },
                { key: "options", count: catalogue?.options.length },
                // A list that couldn't be read is "not known" (—), never 0.
                { key: "fields", count: data && (data.fields?.length ?? null) },
                {
                    key: "allergens",
                    count: data && (data.allergens?.length ?? null),
                },
                { key: "sku" },
                { key: "defaults" },
            ]}
        >
            {!data || !catalogue ? (
                <PageLoading
                    bare
                    shape="rows"
                    width="wide"
                    label="Loading product settings"
                />
            ) : tab === "categories" ? (
                <CategoriesTab catalogue={catalogue} />
            ) : tab === "options" ? (
                <OptionsTab catalogue={catalogue} />
            ) : tab === "fields" ? (
                <FieldsTab catalogue={catalogue} fields={data.fields} />
            ) : tab === "allergens" ? (
                <AllergensTab
                    allergens={data.allergens}
                    canWrite={catalogue.canWrite}
                />
            ) : tab === "sku" ? (
                <SkuTab
                    settings={data.sku?.settings ?? SKU_FALLBACK}
                    preview={data.sku?.preview ?? null}
                    canWrite={catalogue.canWrite}
                />
            ) : (
                <DefaultsTab catalogue={catalogue} />
            )}
        </ProductSettings>
    );
}
