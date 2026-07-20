import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StoreCard } from "@/components/stores/store-card";
import { StoresEmptyState } from "@/components/stores/stores-empty-state";
import { listOrganizations } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { listStores } from "@/lib/stores/service";

export default async function Home() {
    await requireSession();

    // Zero-org funnel: a signed-in user with no organization onboards first.
    const organizations = await listOrganizations();
    if (organizations.length === 0) redirect("/onboarding");

    const stores = await listStores();

    // Global chrome (brand, org switcher, nav, sign-out) lives in AppHeader via
    // the root layout — this page renders only its own content.
    return (
        <main className="mx-auto max-w-5xl p-8">
            <PageHeader
                title="Your stores"
                description="Storefronts you own in this organization."
                actions={
                    stores.length > 0 ? (
                        <Button asChild variant="brand">
                            <Link href="/stores/new">New store</Link>
                        </Button>
                    ) : undefined
                }
            />

            {stores.length === 0 ? (
                <StoresEmptyState />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {stores.map((store) => (
                        <StoreCard key={store.id} store={store} />
                    ))}
                </div>
            )}
        </main>
    );
}
