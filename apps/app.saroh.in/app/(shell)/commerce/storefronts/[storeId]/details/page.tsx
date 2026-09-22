import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { sellCrumbs } from "@/components/commerce/sell-crumbs";
import { PageContainer } from "@/components/shared/page-container";
import { StoreSettingsForm } from "@/components/stores/store-settings-form";
import { requireSession } from "@/lib/session";
import { storefrontHref } from "@/lib/stores/links";
import { getStore } from "@/lib/stores/service";

export const metadata = { title: "Storefront details" };

/**
 * A storefront's name, web address, description and logo — what used to be
 * its Settings tab under `/stores`. Checkout, hours and payments are on the
 * storefront's own panel in Storefronts.
 */
export default async function StorefrontDetailsPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={sellCrumbs(
                    { label: "Storefronts", href: "/commerce/storefronts" },
                    { label: store.name, href: storefrontHref(store.id) },
                    "Details",
                )}
                title="Details"
                description={`${store.name}'s address on the web, and what it says about itself.`}
            />
            <StoreSettingsForm store={store} />
        </PageContainer>
    );
}
