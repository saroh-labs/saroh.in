import { PageHeader } from "@saroh/ui/page-header";
import { TextLink } from "@saroh/ui/text-link";

import { ProductSettingsContainer } from "@/components/commerce/product-settings/settings-container";
import { sellCrumbs } from "@/components/commerce/sell-pages/sell-crumbs";
import { PageContainer } from "@/components/shared/page/page-container";
import type { SettingsTab } from "@/lib/products/links";
import { isSettingsTab } from "@/lib/products/links";
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
 *
 * On React Query (DEC-259): the page decides the tab and draws the
 * header; the lists are the container's query, read in the browser.
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
                    <TextLink
                        data-ph-unmask=""
                        href="/commerce/products"
                        className="text-[12.5px]"
                    >
                        Back to products
                    </TextLink>
                }
            />
            <ProductSettingsContainer tab={tab} />
        </PageContainer>
    );
}
