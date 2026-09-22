import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { Store } from "lucide-react";
import Link from "next/link";

import { sellCrumbs } from "@/components/commerce/sell-crumbs";
import { PageContainer } from "@/components/shared/page-container";
import { CreateStoreForm } from "@/components/stores/create-store-form";
import { mayAddStorefront } from "@/lib/business-limits";
import { requireSession } from "@/lib/session";
import { storefrontHref } from "@/lib/stores/links";
import { listStorefronts } from "@/lib/stores/storefronts";

export const metadata = { title: "New storefront" };

/**
 * Sell → Storefront → New storefront.
 *
 * A business has one storefront for now (ADR-006), and the API refuses a
 * second. Nothing in the workspace links here once it has one, so this is for
 * whoever arrives with the address: said before the form, not after Save.
 */
export default async function NewStorefrontPage() {
    await requireSession();
    const storefronts = await listStorefronts();
    const existing = storefronts.at(0);

    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={sellCrumbs(
                    { label: "Storefront", href: "/commerce/storefronts" },
                    "New storefront",
                )}
                title="New storefront"
                description={
                    existing
                        ? undefined
                        : "Somewhere to sell from — a shop counter, an online store, a market stall. Its hours, checkout and payments are set up on the next screen."
                }
            />
            {existing && !mayAddStorefront(storefronts.length) ? (
                <EmptyState
                    icon={<Store />}
                    title={`${existing.name} is this business's storefront`}
                    description="A business has one storefront for now. Its name, web address, hours, checkout and payments are all changed from there."
                    action={
                        <Button asChild variant="outline">
                            <Link href={storefrontHref(existing.id)}>
                                Go to {existing.name}
                            </Link>
                        </Button>
                    }
                />
            ) : (
                <CreateStoreForm />
            )}
        </PageContainer>
    );
}
