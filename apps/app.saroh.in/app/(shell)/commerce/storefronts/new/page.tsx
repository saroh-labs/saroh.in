import { PageHeader } from "@saroh/ui/page-header";

import { sellCrumbs } from "@/components/commerce/sell-crumbs";
import { PageContainer } from "@/components/shared/page-container";
import { CreateStoreForm } from "@/components/stores/create-store-form";
import { requireSession } from "@/lib/session";

export const metadata = { title: "New storefront" };

/** Sell → Storefronts → New storefront. */
export default async function NewStorefrontPage() {
    await requireSession();
    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={sellCrumbs(
                    { label: "Storefronts", href: "/commerce/storefronts" },
                    "New storefront",
                )}
                title="New storefront"
                description="Somewhere to sell from — a shop counter, an online store, a market stall. Its hours, checkout and payments are set up on the next screen."
            />
            <CreateStoreForm />
        </PageContainer>
    );
}
