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
import {
    getStorefrontAllowance,
    listStorefronts,
} from "@/lib/stores/storefronts";

export const metadata = { title: "New storefront" };

/**
 * Sell → Storefront → New storefront.
 *
 * A business may have several storefronts, up to its plan (ADR-010) — a
 * counter and an online shop count their stock apart. At the plan's number
 * the API refuses another, so this says so before the form, not after Save.
 * An allowance that cannot be read shows the form and leaves it to the API.
 */
export default async function NewStorefrontPage() {
    await requireSession();
    const [storefronts, allowance] = await Promise.all([
        listStorefronts(),
        getStorefrontAllowance().catch(() => null),
    ]);
    // The plan's number, when the business already has that many.
    const full =
        allowance &&
        !mayAddStorefront({ used: storefronts.length, limit: allowance.limit })
            ? allowance.limit
            : null;
    const first = storefronts.at(0);

    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={sellCrumbs(
                    {
                        label:
                            storefronts.length > 1
                                ? "Storefronts"
                                : "Storefront",
                        href: "/commerce/storefronts",
                    },
                    "New storefront",
                )}
                title="New storefront"
                description={
                    full !== null
                        ? undefined
                        : first
                          ? `Another place to sell from, beside ${storefronts.length === 1 ? first.name : `your ${storefronts.length} storefronts`} — it sells from the same catalogue and counts its own stock. Its hours, checkout and payments are set up on the next screen.`
                          : "Somewhere to sell from — a shop counter, an online store, a market stall. Its hours, checkout and payments are set up on the next screen."
                }
            />
            {full !== null ? (
                <EmptyState
                    icon={<Store />}
                    title={`Your plan includes ${full === 1 ? "one storefront" : `${full} storefronts`}`}
                    description={`This business has ${storefronts.length === 1 ? "its one" : `all ${storefronts.length}`}. A bigger plan adds more, or close one it no longer sells from.`}
                    action={
                        <Button asChild variant="outline">
                            <Link href="/commerce/storefronts">
                                {storefronts.length === 1
                                    ? "Go to your storefront"
                                    : "Go to storefronts"}
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
